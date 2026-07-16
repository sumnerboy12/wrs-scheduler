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
  group: string;
  content: string;
  start: string;
  end: string;
  className?: string;
  title?: string;
  style?: string;
  editable?: boolean;
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
