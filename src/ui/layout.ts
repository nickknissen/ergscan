export interface LayoutState {
  wide: boolean;
  stage: string;
  reviewOrigin: string;
  sourcePanel: boolean;
  entries: number;
}

export function listDetail(state: LayoutState): boolean {
  return state.wide && state.stage === 'review' && state.reviewOrigin === 'history' && !state.sourcePanel;
}

export function historyPane(state: LayoutState): boolean {
  return state.wide && state.entries > 0 && (state.stage === 'history' || listDetail(state));
}
