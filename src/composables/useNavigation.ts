import { onScopeDispose, ref } from 'vue';
import { parseRoute, popAction, routeHash, routeTab, TABS, tabRoute, type Monitor, type TabStage } from '../core/route';
import type { HistoryEntry } from '../core/history';
import type { ReviewSession } from './useReviewSession';

export type Stage = 'guide' | 'capture' | 'history' | 'settings' | 'camera' | 'scanning' | 'review';

const GUIDE_SEEN_KEY = 'ergscan.guideSeen';

function guideSeen(): boolean {
  try {
    return localStorage.getItem(GUIDE_SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

function markGuideSeen() {
  try {
    localStorage.setItem(GUIDE_SEEN_KEY, '1');
  } catch {
    // Storage unavailable: the guide simply shows again next time.
  }
}

const baseUrl = () => location.pathname + location.search;
const isTab = (value: Stage): value is TabStage => (TABS as readonly Stage[]).includes(value);

/**
 * Which screen shows, kept in step with the address and browser history: tabs, the guide and its
 * monitor pages, and the review screen with its unsaved-changes check on the way out.
 *
 * The screen is known from the start; the review session is attached with `connect` once it
 * exists, which also starts following browser history and reopens the workout in the address.
 * `stage` changes only through this module.
 */
export function useNavigation(options: { syncEnabled: boolean }) {
  const { syncEnabled } = options;

  const incomingPair = ref('');
  function readPairLink(): boolean {
    if (!syncEnabled || !location.hash.startsWith('#link/')) return false;
    incomingPair.value = location.hash.slice('#link/'.length);
    window.history.replaceState(null, '', baseUrl() + '#/settings');
    return true;
  }
  readPairLink();
  const initialRoute = parseRoute(location.hash);
  if (initialRoute.page === 'home' && !guideSeen()) window.history.replaceState(null, '', routeHash({ page: 'guide', monitor: null }));
  const startRoute = parseRoute(location.hash);
  const stage = ref<Stage>(startRoute.page === 'guide' ? 'guide' : routeTab(startRoute));
  const guideMonitor = ref<Monitor | null>(startRoute.page === 'guide' ? startRoute.monitor : null);
  let stageAfterBack: TabStage | null = null;
  let ignoreNextPop = false;
  let review: ReviewSession;

  function show(next: Stage) {
    stage.value = next;
  }

  function syncTabUrl() {
    if (!isTab(stage.value)) return;
    const hash = routeHash(tabRoute(stage.value));
    if (location.hash !== hash) window.history.replaceState(window.history.state, '', baseUrl() + hash);
  }

  function openGuide() {
    window.history.pushState({ guide: 1 }, '', routeHash({ page: 'guide', monitor: null }));
    guideMonitor.value = null;
    stage.value = 'guide';
  }

  function pickMonitor(monitor: Monitor) {
    window.history.pushState({ guide: (window.history.state?.guide ?? 0) + 1 }, '', routeHash({ page: 'guide', monitor }));
    guideMonitor.value = monitor;
  }

  function changeMonitor() {
    guideMonitor.value = null;
    if (window.history.state?.guide > 1) {
      ignoreNextPop = true;
      window.history.back();
    } else {
      window.history.replaceState(window.history.state, '', routeHash({ page: 'guide', monitor: null }));
    }
  }

  async function goTo(next: TabStage) {
    if (stage.value === 'review') {
      if (review.unsaved.value && !(await review.confirmDiscard())) return;
      leaveReview();
    }
    if (stage.value === 'guide') {
      markGuideSeen();
      const depth: number = window.history.state?.guide ?? 0;
      if (depth > 0) {
        stageAfterBack = next;
        window.history.go(-depth);
        return;
      }
    }
    stage.value = next;
    syncTabUrl();
  }

  function closeGuide() {
    void goTo('capture');
  }

  /** Clears the open workout and everything that belongs to it, back on the scan screen. */
  function reset() {
    review.clear();
    stage.value = 'capture';
  }

  function showReview(id: string | null) {
    stage.value = 'review';
    window.history.pushState({ workout: true }, '', routeHash({ page: 'workout', id }));
  }

  async function openEntry(id: string, push = true): Promise<boolean> {
    const found = await review.findEntry(id);
    if (!found) return false;
    reset();
    review.applyEntry(found);
    if (push) showReview(found.entry.id);
    else stage.value = 'review';
    return true;
  }

  function restoreDraft(id: string | null): boolean {
    const draft = review.findDraft(id);
    if (!draft) return false;
    reset();
    review.applyDraft(draft);
    stage.value = 'review';
    return true;
  }

  async function saveWorkout() {
    const id = await review.save();
    if (id !== null) window.history.replaceState(window.history.state, '', routeHash({ page: 'workout', id }));
  }

  function closeReview() {
    const origin = review.reviewOrigin.value;
    reset();
    stage.value = origin;
  }

  function leaveReview() {
    closeReview();
    if (window.history.state?.workout) {
      ignoreNextPop = true;
      window.history.back();
    } else {
      window.history.replaceState(null, '', baseUrl());
      syncTabUrl();
    }
  }

  async function discardWorkout() {
    if (review.unsaved.value && !(await review.confirmDiscard())) return;
    leaveReview();
  }

  async function backFromReview() {
    if (!review.unsaved.value) {
      closeReview();
      return;
    }
    const id = review.savedKey.value === null ? null : review.historyId.value;
    window.history.pushState({ workout: true }, '', routeHash({ page: 'workout', id }));
    if (await review.confirmDiscard()) leaveReview();
  }

  async function selectEntry(entry: HistoryEntry) {
    if (stage.value !== 'review') {
      await openEntry(entry.id);
      return;
    }
    if (review.historyId.value === entry.id || (review.unsaved.value && !(await review.confirmDiscard()))) return;
    if (!(await openEntry(entry.id, false))) return;
    window.history.replaceState(window.history.state, '', routeHash({ page: 'workout', id: entry.id }));
  }

  async function onPopState() {
    if (readPairLink()) {
      await goTo('settings');
      return;
    }
    if (ignoreNextPop) {
      ignoreNextPop = false;
      syncTabUrl();
      return;
    }
    const route = parseRoute(location.hash);
    const action = popAction(stage.value, route, stageAfterBack);
    if (action.kind === 'backFromReview') {
      void backFromReview();
    } else if (action.kind === 'guide') {
      stage.value = 'guide';
      guideMonitor.value = action.monitor;
    } else if (action.kind === 'closeGuide') {
      markGuideSeen();
      stage.value = action.to;
    } else if (action.kind === 'openWorkout') {
      if (action.id === null || !(await openEntry(action.id, false))) window.history.replaceState(null, '', baseUrl());
    } else if (action.kind === 'tab') {
      stage.value = action.to;
    }
    stageAfterBack = null;
    syncTabUrl();
  }

  /**
   * Attaches the review session, follows browser history from now on, and once history has
   * loaded reopens the workout the address names: the unsaved draft if there is one, else the saved entry.
   */
  function connect(session: ReviewSession, readyHistory: Promise<unknown>) {
    review = session;
    window.addEventListener('popstate', onPopState);
    onScopeDispose(() => window.removeEventListener('popstate', onPopState));
    if (initialRoute.page !== 'workout') return;
    const route = initialRoute;
    void readyHistory.then(async () => {
      if (location.hash !== routeHash(route)) return;
      if (!restoreDraft(route.id) && (route.id === null || !(await openEntry(route.id, false)))) {
        window.history.replaceState(null, '', baseUrl());
      }
    });
  }

  return {
    stage,
    guideMonitor,
    incomingPair,
    connect,
    show,
    reset,
    goTo,
    openGuide,
    closeGuide,
    pickMonitor,
    changeMonitor,
    showReview,
    leaveReview,
    discardWorkout,
    selectEntry,
    saveWorkout,
  };
}

export type Navigation = ReturnType<typeof useNavigation>;
