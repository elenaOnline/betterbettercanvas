// Every Canvas selector better-todo depends on, in one place. The panel's own
// mount points (classic #right-side-wrapper, new dashboard Courses tab) are
// core's SIDE_HOSTS (src/core/side-panel.ts).
import { SIDE_HOSTS } from '../../core/side-panel.ts';

export const anchors = {
  sidebar: `${SIDE_HOSTS.classic}, ${SIDE_HOSTS.courses}`,
  rightSide: '#right-side',
  nativeTodo: '#right-side .Sidebar__TodoListContainer, #right-side .todo-list-header, #right-side .to-do-list',
};
