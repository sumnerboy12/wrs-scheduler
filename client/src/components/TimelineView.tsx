import { useEffect, useRef } from 'react';
import { Timeline } from 'vis-timeline/standalone';
import { DataSet } from 'vis-data/standalone';
import 'vis-timeline/styles/vis-timeline-graph2d.min.css';

export interface TLGroup {
  id: string;
  content: string;
  className?: string;
  style?: string;
  nestedGroups?: string[];
  subgroupStack?: boolean;
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

interface Props {
  groups: TLGroup[];
  items: TLItem[];
  window: { start: Date; end: Date } | null;
  onWindowChange: (start: Date, end: Date) => void;
  onItemDoubleClick: (itemId: number | string) => void;
  onEmptyDoubleClick: (groupId: string, time: Date) => void;
  onItemMoved: (itemId: number | string, start: Date, end: Date, groupId: string) => void;
}

export default function TimelineView({
  groups,
  items,
  window: windowRange,
  onWindowChange,
  onItemDoubleClick,
  onEmptyDoubleClick,
  onItemMoved,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<Timeline | null>(null);
  const groupsDataSet = useRef(new DataSet<TLGroup>([]));
  const itemsDataSet = useRef(new DataSet<TLItem>([]));
  const callbacksRef = useRef({ onItemDoubleClick, onEmptyDoubleClick, onItemMoved, onWindowChange });

  callbacksRef.current = { onItemDoubleClick, onEmptyDoubleClick, onItemMoved, onWindowChange };

  useEffect(() => {
    if (!containerRef.current) return;

    const timeline = new Timeline(containerRef.current, itemsDataSet.current, groupsDataSet.current, {
      stack: true,
      horizontalScroll: true,
      zoomKey: 'ctrlKey',
      zoomMin: 1000 * 60 * 60 * 24, // 1 day
      zoomMax: 1000 * 60 * 60 * 24 * 400, // ~13 months
      orientation: 'top',
      margin: { item: 6, axis: 10 },
      // Pass the restored range up front — if the widget mounts with no
      // configured range, vis-timeline auto-fits to the item data on its
      // first (deferred) redraw and can silently overwrite a range set
      // via setWindow() moments earlier, desyncing the view from `preset`.
      ...(windowRange ? { start: windowRange.start, end: windowRange.end } : {}),
      editable: {
        add: false,
        updateTime: true,
        updateGroup: true,
        remove: false,
      },
      // vis-timeline runs all item/group `content` HTML through an XSS
      // sanitizer by default, which strips class and style attributes —
      // silently dropping any custom styling in group labels. We build
      // every content string ourselves (SchedulePage.tsx) and escape all
      // user-entered text via escapeHtml() before interpolating it, so
      // it's safe to trust here.
      xss: { disabled: true },
      snap: (date: Date) => snapToNearestLocalDay(date),
      onMove: (item: any, callback: (item: any) => void) => {
        callbacksRef.current.onItemMoved(item.id, item.start, item.end, item.group);
        callback(item);
      },
      showCurrentTime: true,
      tooltip: { followMouse: true },
    });

    timeline.on('doubleClick', (props: any) => {
      if (props.item != null) {
        callbacksRef.current.onItemDoubleClick(props.item);
      } else if (props.group != null && props.time) {
        callbacksRef.current.onEmptyDoubleClick(props.group, props.time);
      }
    });

    timeline.on('rangechanged', (props: any) => {
      callbacksRef.current.onWindowChange(props.start, props.end);
    });

    timelineRef.current = timeline;

    return () => {
      timeline.destroy();
      timelineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    groupsDataSet.current.clear();
    groupsDataSet.current.add(groups);
  }, [groups]);

  useEffect(() => {
    itemsDataSet.current.clear();
    itemsDataSet.current.add(items);
  }, [items]);

  useEffect(() => {
    if (windowRange && timelineRef.current) {
      timelineRef.current.setWindow(windowRange.start, windowRange.end);
    }
  }, [windowRange]);

  return <div ref={containerRef} style={{ background: 'var(--panel)' }} />;
}
