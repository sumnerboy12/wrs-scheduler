import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Timeline } from 'vis-timeline/standalone';
import { DataSet } from 'vis-data/standalone';
import moment from 'moment';
import 'vis-timeline/styles/vis-timeline-graph2d.min.css';

// vis-timeline's standalone build bundles its own internal copy of moment,
// entirely separate from this import — mutating this instance's locale has
// no effect on that one, which is why the `moment` Timeline option below
// (rather than just calling moment.locale()/updateLocale() and hoping) is
// what's needed to make the week scale's day-of-week alignment (and
// anything else date-related internally) actually use Monday as the start
// of the week, matching the rest of the app (see startOfWeek in lib/dates.ts).
moment.updateLocale('en', { week: { dow: 1, doy: 4 } });

export interface TLGroup {
  id: string;
  content: string;
  className?: string;
  style?: string;
  nestedGroups?: string[];
  subgroupStack?: boolean;
  // Only meaningful on a group that has nestedGroups — collapses/expands
  // its children. Omitted (rather than defaulted true) so a fresh groups
  // array from SchedulePage never fights whatever collapse state
  // collapseAllGroups/expandAllGroups last put the live DataSet in.
  showNested?: boolean;
}

export interface TimelineViewHandle {
  collapseAllGroups: () => void;
  expandAllGroups: () => void;
}

export interface TLItem {
  id: number | string;
  // Omit for a `type: 'background'` item (e.g. weekend/holiday shading) —
  // those span the full height across every group rather than sitting in
  // one row.
  group?: string;
  content: string;
  // Real Date objects, not ISO strings — a bare "YYYY-MM-DD" string parses
  // as UTC midnight per spec, which mis-anchors every bar by the local
  // UTC offset and corrupts drag/resize math. Callers must build these
  // with parseISODateLocal (see lib/dates.ts).
  start: Date;
  end: Date;
  className?: string;
  title?: string;
  style?: string;
  editable?: boolean;
  type?: 'background';
}

// vis-timeline's default snap rounds to the nearest 12-hour boundary at
// day/week zoom (noon or midnight) and to even coarser boundaries at
// wider zooms — none of which line up with this app's day-only data
// model. Always snap to the nearest local calendar day instead, so a
// drag or resize lands on exactly the day it looks like it landed on,
// regardless of zoom level.
function snapToNearestLocalDay(date: Date): Date {
  const snapped = new Date(date);
  if (snapped.getHours() >= 12) {
    snapped.setDate(snapped.getDate() + 1);
  }
  snapped.setHours(0, 0, 0, 0);
  return snapped;
}

// vis-timeline auto-picks the axis scale from the current zoom width, which
// at wide enough zoom jumps straight from 'day' to 'month'/'year' with no
// 'week' tier in between — too coarse to read an exact date without
// zooming back in. Rather than guess our own day-count threshold for when
// to override (which fights vis-timeline's own auto-scaling at every other
// zoom level — tried that, it froze the axis so it stopped adapting at
// all while zooming within that range), this lets vis-timeline pick
// naturally and only steps in when the result is coarser than week.
const COARSE_SCALES = new Set(['month', 'year']);

function labelsOverlap(container: HTMLElement): boolean {
  // Each label's own element is a full-width "slot" box spanning the whole
  // tick interval (always touching its neighbour by design, whether the
  // text inside is wide or not) — its own getBoundingClientRect() is
  // useless for detecting overlap. A Range over just its text content
  // shrink-wraps to the actual rendered glyphs instead. vis-timeline also
  // leaves a hidden "vis-measure" helper element (used internally to
  // measure character widths) matching this same selector — filtered out
  // since it isn't a real label and would otherwise register as a false
  // overlap with whatever real label happens to sit at the same position.
  const range = document.createRange();
  const rects = Array.from(container.querySelectorAll<HTMLElement>('.vis-time-axis .vis-text.vis-minor'))
    .filter((el) => !el.classList.contains('vis-measure') && el.textContent?.trim())
    .map((el) => {
      range.selectNodeContents(el);
      return range.getBoundingClientRect();
    })
    .sort((a, b) => a.left - b.left);
  for (let i = 1; i < rects.length; i++) {
    if (rects[i].left < rects[i - 1].right) return true;
  }
  return false;
}

function reconcileMinimumWeekScale(timeline: Timeline, container: HTMLElement) {
  // Clears any override from a previous call so vis-timeline re-picks a
  // genuine auto scale for the *current* window, rather than seeing
  // whatever we forced last time reflected back at us.
  timeline.setOptions({ timeAxis: {} });
  // Core._redraw is itself throttled to one requestAnimationFrame (see
  // vis-timeline's own source), so the scale this just picked isn't
  // available until the frame after this setOptions call actually runs.
  requestAnimationFrame(() => {
    const internals = timeline as unknown as { timeAxis?: { step?: { scale?: string } } };
    const autoScale = internals.timeAxis?.step?.scale;
    if (!autoScale || !COARSE_SCALES.has(autoScale)) {
      // Auto already landed on 'week' or finer, which — being auto — never
      // overlaps by construction (it's what picking a wider step at wider
      // zoom is for). Only our own forced override below bypasses that,
      // so only that branch needs the overlap check.
      timeline.setOptions({ showMinorLabels: true });
      return;
    }
    timeline.setOptions({ timeAxis: { scale: 'week', step: 1 }, showMinorLabels: true });
    // Forcing the scale just queued another throttled redraw — need a
    // second frame for the actual week labels to be in the DOM before
    // measuring whether they fit.
    requestAnimationFrame(() => {
      timeline.setOptions({ showMinorLabels: !labelsOverlap(container) });
    });
  });
}

interface Props {
  groups: TLGroup[];
  items: TLItem[];
  window: { start: Date; end: Date } | null;
  onWindowChange: (start: Date, end: Date) => void;
  onItemDoubleClick: (itemId: number | string) => void;
  onEmptyDoubleClick: (groupId: string, time: Date) => void;
  onLabelDoubleClick: (groupId: string) => void;
  onItemMoved: (itemId: number | string, start: Date, end: Date, groupId: string) => void;
  // Fires whenever which nesting groups are collapsed actually changes —
  // a user clicking a job's own label, or the Collapse All/Expand All
  // buttons, both end up here (both go through vis-timeline's own
  // toggleGroupShowNested, which updates the groups DataSet). Lets the
  // caller persist collapse state itself, since vis-timeline doesn't.
  onNestingStateChange?: (collapsedGroupIds: string[]) => void;
  readOnly?: boolean;
}

const TimelineView = forwardRef<TimelineViewHandle, Props>(function TimelineView({
  groups,
  items,
  window: windowRange,
  onWindowChange,
  onItemDoubleClick,
  onEmptyDoubleClick,
  onLabelDoubleClick,
  onItemMoved,
  onNestingStateChange,
  readOnly,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<Timeline | null>(null);
  const groupsDataSet = useRef(new DataSet<TLGroup>([]));
  const itemsDataSet = useRef(new DataSet<TLItem>([]));
  const callbacksRef = useRef({ onItemDoubleClick, onEmptyDoubleClick, onLabelDoubleClick, onItemMoved, onWindowChange, onNestingStateChange });

  callbacksRef.current = { onItemDoubleClick, onEmptyDoubleClick, onLabelDoubleClick, onItemMoved, onWindowChange, onNestingStateChange };

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const groupsData = groupsDataSet.current;

    const timeline = new Timeline(container, itemsDataSet.current, groupsData, {
      // Without an explicit height, vis-timeline sizes itself to fit every
      // row (auto-height) rather than filling its flex-constrained parent —
      // that's what was pushing the whole page into scrolling as one unit,
      // taking the toolbar/legend/time-axis with it. Filling the parent
      // here instead makes vis-timeline manage its own internal vertical
      // scrollbar for the row area, which is what keeps everything above it
      // fixed in place.
      height: '100%',
      // Off by default — without it, rows taller than the fixed height
      // above are simply clipped with no way to reach them at all.
      verticalScroll: true,
      stack: true,
      horizontalScroll: true,
      zoomKey: 'ctrlKey',
      zoomMin: 1000 * 60 * 60 * 24, // 1 day
      zoomMax: 1000 * 60 * 60 * 24 * 400, // ~13 months
      orientation: 'top',
      // margin.axis only pads the row closest to the time axis (the top
      // row, since orientation is 'top'). margin.item.horizontal is set to
      // 0 rather than inheriting the vertical value — vis-timeline pads
      // each item's effective width by this amount purely to decide
      // whether two items collide, so a horizontal margin above 0 forces
      // back-to-back (but non-overlapping) assignments for the same
      // employee onto separate stacked rows just to keep that gap, even
      // though they never actually overlap in time.
      margin: { item: { horizontal: 0, vertical: 6 }, axis: 2 },
      // Pass the restored range up front — if the widget mounts with no
      // configured range, vis-timeline auto-fits to the item data on its
      // first (deferred) redraw and can silently overwrite a range set
      // via setWindow() moments earlier, desyncing the view from `preset`.
      ...(windowRange ? { start: windowRange.start, end: windowRange.end } : {}),
      editable: {
        add: false,
        updateTime: !readOnly,
        updateGroup: !readOnly,
        remove: false,
      },
      // vis-timeline runs all item/group `content` HTML through an XSS
      // sanitizer by default, which strips class and style attributes —
      // silently dropping any custom styling in group labels. We build
      // every content string ourselves (SchedulePage.tsx) and escape all
      // user-entered text via escapeHtml() before interpolating it, so
      // it's safe to trust here.
      xss: { disabled: true },
      // Estimate-placeholder bars (phase-estimate-*) should always stack
      // above a phase's real staff bars, so the "no one's assigned yet"
      // signal stays visible rather than getting buried underneath actual
      // assignments once someone's booked on.
      order: (a: any, b: any) => {
        const aIsEstimate = typeof a.id === 'string' && a.id.startsWith('phase-estimate-');
        const bIsEstimate = typeof b.id === 'string' && b.id.startsWith('phase-estimate-');
        if (aIsEstimate !== bIsEstimate) return aIsEstimate ? -1 : 1;
        return a.start - b.start;
      },
      snap: (date: Date) => snapToNearestLocalDay(date),
      onMove: (item: any, callback: (item: any) => void) => {
        callbacksRef.current.onItemMoved(item.id, item.start, item.end, item.group);
        callback(item);
      },
      showCurrentTime: true,
      tooltip: { followMouse: true },
      // Only overrides the week scale's label — vis-timeline's own
      // defaults for every other scale (day, month, ...) are left alone.
      // "D/M" (no leading zeros) rather than "DD/MM" or a month name,
      // matching this app's day-first date convention elsewhere (see
      // formatShortDate in lib/dates.ts).
      format: { minorLabels: { week: 'D/M' } },
      // Our Monday-first moment instance (see the module-level
      // updateLocale call above) — makes the week scale's ticks land on
      // Monday instead of vis-timeline's own bundled moment's Sunday.
      moment,
    });

    timeline.on('doubleClick', (props: any) => {
      if (props.item != null) {
        callbacksRef.current.onItemDoubleClick(props.item);
      } else if (props.what === 'group-label' && props.group != null) {
        callbacksRef.current.onLabelDoubleClick(props.group);
      } else if (props.group != null && props.time) {
        callbacksRef.current.onEmptyDoubleClick(props.group, props.time);
      }
    });

    timeline.on('rangechanged', (props: any) => {
      callbacksRef.current.onWindowChange(props.start, props.end);
      reconcileMinimumWeekScale(timeline, container);
    });
    // rangechanged only fires on a *change* — set the initial window's
    // scale too, since mounting with a restored range doesn't count as one.
    reconcileMinimumWeekScale(timeline, container);

    // Fires on every DataSet .update() to the groups — including the one
    // vis-timeline's own toggleGroupShowNested makes internally on a
    // label click or our collapseAllGroups/expandAllGroups. Recomputing
    // from the DataSet itself (rather than trying to diff the payload)
    // keeps this correct regardless of which path triggered it.
    const handleGroupsUpdate = () => {
      if (!callbacksRef.current.onNestingStateChange) return;
      const collapsedIds = groupsData
        .get()
        .filter((g) => g.nestedGroups && g.showNested === false)
        .map((g) => g.id);
      callbacksRef.current.onNestingStateChange(collapsedIds);
    };
    groupsData.on('update', handleGroupsUpdate);

    timelineRef.current = timeline;

    return () => {
      groupsData.off('update', handleGroupsUpdate);
      timeline.destroy();
      timelineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Patch the DataSets in place rather than clear()+add() on every change —
  // clearing briefly empties the DataSet, which collapses vis-timeline's
  // row area to zero height and resets its internal vertical scroll
  // position to the top; it doesn't get restored once rows come back.
  // update() upserts by id (creates rows that are new, replaces fields on
  // ones that already exist), so we only need to separately remove() ids
  // that no longer appear.
  useEffect(() => {
    const ds = groupsDataSet.current;
    const nextIds = new Set(groups.map((g) => g.id));
    const staleIds = ds.getIds().filter((id) => !nextIds.has(id as string));
    if (staleIds.length) ds.remove(staleIds);
    if (groups.length) ds.update(groups);
  }, [groups]);

  useEffect(() => {
    const ds = itemsDataSet.current;
    const nextIds = new Set(items.map((i) => i.id));
    const staleIds = ds.getIds().filter((id) => !nextIds.has(id as number | string));
    if (staleIds.length) ds.remove(staleIds);
    if (items.length) ds.update(items);
  }, [items]);

  useEffect(() => {
    if (windowRange && timelineRef.current) {
      timelineRef.current.setWindow(windowRange.start, windowRange.end);
    }
  }, [windowRange]);

  // vis-timeline has no public "collapse every nesting group" API — a plain
  // DataSet update only flips the parent's own showNested flag and misses
  // the library's own cascade onto its nested children's `visible` field
  // (confirmed by reading vis-timeline's toggleGroupShowNested source),
  // leaving expanded phase rows still on-screen under a "collapsed" job.
  // Reaching into the itemSet and calling that same internal method per
  // nesting group replicates exactly what a real label click does.
  const setAllNestingGroups = (expand: boolean) => {
    const itemSet = (timelineRef.current as unknown as { itemSet?: Record<string, any> })?.itemSet;
    if (!itemSet) return;
    for (const group of Object.values(itemSet.groups as Record<string, any>)) {
      if (group?.nestedGroups) itemSet.toggleGroupShowNested(group, expand);
    }
  };

  useImperativeHandle(ref, () => ({
    collapseAllGroups: () => setAllNestingGroups(false),
    expandAllGroups: () => setAllNestingGroups(true),
  }), []);

  // vis-timeline's own root element is told height:100% (see the Timeline
  // options above) so it fills this div rather than growing to fit every
  // row — but a percentage height only resolves against a parent that
  // itself has a definite height, so this div needs one explicitly too.
  return <div ref={containerRef} style={{ background: 'var(--panel)', height: '100%' }} />;
});

export default TimelineView;
