import { icon, type IconName } from '@nickknissen/m3-vue/icons';
import type { Feeling } from '../core/feeling';
import add from '@material-symbols/svg-400/rounded/add.svg?raw';
import arrowBack from '@material-symbols/svg-400/rounded/arrow_back.svg?raw';
import arrowDropDown from '@material-symbols/svg-400/rounded/arrow_drop_down.svg?raw';
import cake from '@material-symbols/svg-400/rounded/cake.svg?raw';
import cameraswitch from '@material-symbols/svg-400/rounded/cameraswitch.svg?raw';
import calculate from '@material-symbols/svg-400/rounded/calculate.svg?raw';
import check from '@material-symbols/svg-400/rounded/check.svg?raw';
import cloudDone from '@material-symbols/svg-400/rounded/cloud_done.svg?raw';
import cloudOff from '@material-symbols/svg-400/rounded/cloud_off.svg?raw';
import cloudSync from '@material-symbols/svg-400/rounded/cloud_sync.svg?raw';
import contrast from '@material-symbols/svg-400/rounded/contrast.svg?raw';
import deleteForever from '@material-symbols/svg-400/rounded/delete_forever.svg?raw';
import deleteIcon from '@material-symbols/svg-400/rounded/delete.svg?raw';
import documentScannerFill from '@material-symbols/svg-400/rounded/document_scanner-fill.svg?raw';
import documentScanner from '@material-symbols/svg-400/rounded/document_scanner.svg?raw';
import doNotDisturbOn from '@material-symbols/svg-400/rounded/do_not_disturb_on.svg?raw';
import devices from '@material-symbols/svg-400/rounded/devices.svg?raw';
import download from '@material-symbols/svg-400/rounded/download.svg?raw';
import edit from '@material-symbols/svg-400/rounded/edit.svg?raw';
import historyFill from '@material-symbols/svg-400/rounded/history-fill.svg?raw';
import history from '@material-symbols/svg-400/rounded/history.svg?raw';
import key from '@material-symbols/svg-400/rounded/key.svg?raw';
import keyboardArrowDown from '@material-symbols/svg-400/rounded/keyboard_arrow_down.svg?raw';
import leftPanelClose from '@material-symbols/svg-400/rounded/left_panel_close.svg?raw';
import leftPanelOpen from '@material-symbols/svg-400/rounded/left_panel_open.svg?raw';
import linkIcon from '@material-symbols/svg-400/rounded/link.svg?raw';
import linkOff from '@material-symbols/svg-400/rounded/link_off.svg?raw';
import menuBook from '@material-symbols/svg-400/rounded/menu_book.svg?raw';
import monitorHeart from '@material-symbols/svg-400/rounded/monitor_heart.svg?raw';
import moreVert from '@material-symbols/svg-400/rounded/more_vert.svg?raw';
import palette from '@material-symbols/svg-400/rounded/palette.svg?raw';
import photoCamera from '@material-symbols/svg-400/rounded/photo_camera.svg?raw';
import photoLibrary from '@material-symbols/svg-400/rounded/photo_library.svg?raw';
import print from '@material-symbols/svg-400/rounded/print.svg?raw';
import qrCodeScanner from '@material-symbols/svg-400/rounded/qr_code_scanner.svg?raw';
import redo from '@material-symbols/svg-400/rounded/redo.svg?raw';
import rowing from '@material-symbols/svg-400/rounded/rowing.svg?raw';
import sentimentDissatisfiedFill from '@material-symbols/svg-400/rounded/sentiment_dissatisfied-fill.svg?raw';
import sentimentDissatisfied from '@material-symbols/svg-400/rounded/sentiment_dissatisfied.svg?raw';
import sentimentNeutralFill from '@material-symbols/svg-400/rounded/sentiment_neutral-fill.svg?raw';
import sentimentNeutral from '@material-symbols/svg-400/rounded/sentiment_neutral.svg?raw';
import sentimentSatisfiedFill from '@material-symbols/svg-400/rounded/sentiment_satisfied-fill.svg?raw';
import sentimentSatisfied from '@material-symbols/svg-400/rounded/sentiment_satisfied.svg?raw';
import sentimentVeryDissatisfiedFill from '@material-symbols/svg-400/rounded/sentiment_very_dissatisfied-fill.svg?raw';
import sentimentVeryDissatisfied from '@material-symbols/svg-400/rounded/sentiment_very_dissatisfied.svg?raw';
import sentimentVerySatisfiedFill from '@material-symbols/svg-400/rounded/sentiment_very_satisfied-fill.svg?raw';
import sentimentVerySatisfied from '@material-symbols/svg-400/rounded/sentiment_very_satisfied.svg?raw';
import settingsFill from '@material-symbols/svg-400/rounded/settings-fill.svg?raw';
import settings from '@material-symbols/svg-400/rounded/settings.svg?raw';
import share from '@material-symbols/svg-400/rounded/share.svg?raw';
import sync from '@material-symbols/svg-400/rounded/sync.svg?raw';
import syncProblem from '@material-symbols/svg-400/rounded/sync_problem.svg?raw';
import trophy from '@material-symbols/svg-400/rounded/trophy.svg?raw';
import undo from '@material-symbols/svg-400/rounded/undo.svg?raw';
import upload from '@material-symbols/svg-400/rounded/upload.svg?raw';
import viewDay from '@material-symbols/svg-400/rounded/view_day.svg?raw';
import warning from '@material-symbols/svg-400/rounded/warning.svg?raw';

/**
 * Every icon the app shows, outlined and filled. main.ts gives them to MdIcon (m3-vue's), and
 * the declaration below makes their names its `IconName`.
 */
export const ICONS = {
  add: icon(add),
  arrow_back: icon(arrowBack),
  arrow_drop_down: icon(arrowDropDown),
  cake: icon(cake),
  calculate: icon(calculate),
  cameraswitch: icon(cameraswitch),
  check: icon(check),
  cloud_done: icon(cloudDone),
  cloud_off: icon(cloudOff),
  cloud_sync: icon(cloudSync),
  contrast: icon(contrast),
  delete: icon(deleteIcon),
  delete_forever: icon(deleteForever),
  devices: icon(devices),
  do_not_disturb_on: icon(doNotDisturbOn),
  document_scanner: icon(documentScanner, documentScannerFill),
  download: icon(download),
  edit: icon(edit),
  history: icon(history, historyFill),
  key: icon(key),
  keyboard_arrow_down: icon(keyboardArrowDown),
  left_panel_close: icon(leftPanelClose),
  left_panel_open: icon(leftPanelOpen),
  link: icon(linkIcon),
  link_off: icon(linkOff),
  menu_book: icon(menuBook),
  monitor_heart: icon(monitorHeart),
  more_vert: icon(moreVert),
  palette: icon(palette),
  photo_camera: icon(photoCamera),
  photo_library: icon(photoLibrary),
  print: icon(print),
  qr_code_scanner: icon(qrCodeScanner),
  redo: icon(redo),
  rowing: icon(rowing),
  sentiment_dissatisfied: icon(sentimentDissatisfied, sentimentDissatisfiedFill),
  sentiment_neutral: icon(sentimentNeutral, sentimentNeutralFill),
  sentiment_satisfied: icon(sentimentSatisfied, sentimentSatisfiedFill),
  sentiment_very_dissatisfied: icon(sentimentVeryDissatisfied, sentimentVeryDissatisfiedFill),
  sentiment_very_satisfied: icon(sentimentVerySatisfied, sentimentVerySatisfiedFill),
  settings: icon(settings, settingsFill),
  share: icon(share),
  sync: icon(sync),
  sync_problem: icon(syncProblem),
  trophy: icon(trophy),
  undo: icon(undo),
  upload: icon(upload),
  view_day: icon(viewDay),
  warning: icon(warning),
};

type AppIcons = typeof ICONS;

declare module '@nickknissen/m3-vue/icons' {
  interface Icons extends AppIcons {}
}

export type { IconName };

/** Faces for how a workout felt, from weary (1) to beaming (5). */
export const FEELING_ICONS = {
  1: 'sentiment_very_dissatisfied',
  2: 'sentiment_dissatisfied',
  3: 'sentiment_neutral',
  4: 'sentiment_satisfied',
  5: 'sentiment_very_satisfied',
} as const satisfies Record<Feeling, IconName>;
