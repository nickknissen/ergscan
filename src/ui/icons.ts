import add from '@material-symbols/svg-400/rounded/add.svg?raw';
import arrowBack from '@material-symbols/svg-400/rounded/arrow_back.svg?raw';
import arrowDropDown from '@material-symbols/svg-400/rounded/arrow_drop_down.svg?raw';
import cake from '@material-symbols/svg-400/rounded/cake.svg?raw';
import cameraswitch from '@material-symbols/svg-400/rounded/cameraswitch.svg?raw';
import calculate from '@material-symbols/svg-400/rounded/calculate.svg?raw';
import check from '@material-symbols/svg-400/rounded/check.svg?raw';
import contrast from '@material-symbols/svg-400/rounded/contrast.svg?raw';
import deleteForever from '@material-symbols/svg-400/rounded/delete_forever.svg?raw';
import deleteIcon from '@material-symbols/svg-400/rounded/delete.svg?raw';
import documentScannerFill from '@material-symbols/svg-400/rounded/document_scanner-fill.svg?raw';
import documentScanner from '@material-symbols/svg-400/rounded/document_scanner.svg?raw';
import doNotDisturbOn from '@material-symbols/svg-400/rounded/do_not_disturb_on.svg?raw';
import download from '@material-symbols/svg-400/rounded/download.svg?raw';
import edit from '@material-symbols/svg-400/rounded/edit.svg?raw';
import historyFill from '@material-symbols/svg-400/rounded/history-fill.svg?raw';
import history from '@material-symbols/svg-400/rounded/history.svg?raw';
import keyboardArrowDown from '@material-symbols/svg-400/rounded/keyboard_arrow_down.svg?raw';
import leftPanelClose from '@material-symbols/svg-400/rounded/left_panel_close.svg?raw';
import leftPanelOpen from '@material-symbols/svg-400/rounded/left_panel_open.svg?raw';
import menuBook from '@material-symbols/svg-400/rounded/menu_book.svg?raw';
import monitorHeart from '@material-symbols/svg-400/rounded/monitor_heart.svg?raw';
import moreVert from '@material-symbols/svg-400/rounded/more_vert.svg?raw';
import palette from '@material-symbols/svg-400/rounded/palette.svg?raw';
import photoCamera from '@material-symbols/svg-400/rounded/photo_camera.svg?raw';
import photoLibrary from '@material-symbols/svg-400/rounded/photo_library.svg?raw';
import print from '@material-symbols/svg-400/rounded/print.svg?raw';
import redo from '@material-symbols/svg-400/rounded/redo.svg?raw';
import rowing from '@material-symbols/svg-400/rounded/rowing.svg?raw';
import settingsFill from '@material-symbols/svg-400/rounded/settings-fill.svg?raw';
import settings from '@material-symbols/svg-400/rounded/settings.svg?raw';
import share from '@material-symbols/svg-400/rounded/share.svg?raw';
import undo from '@material-symbols/svg-400/rounded/undo.svg?raw';
import viewDay from '@material-symbols/svg-400/rounded/view_day.svg?raw';
import warning from '@material-symbols/svg-400/rounded/warning.svg?raw';

const inner = (svg: string) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

const pair = (outlined: string, filled = outlined) => [inner(outlined), inner(filled)] as const;

export const ICONS = {
  add: pair(add),
  arrow_back: pair(arrowBack),
  arrow_drop_down: pair(arrowDropDown),
  cake: pair(cake),
  calculate: pair(calculate),
  cameraswitch: pair(cameraswitch),
  check: pair(check),
  contrast: pair(contrast),
  delete: pair(deleteIcon),
  delete_forever: pair(deleteForever),
  do_not_disturb_on: pair(doNotDisturbOn),
  document_scanner: pair(documentScanner, documentScannerFill),
  download: pair(download),
  edit: pair(edit),
  history: pair(history, historyFill),
  keyboard_arrow_down: pair(keyboardArrowDown),
  left_panel_close: pair(leftPanelClose),
  left_panel_open: pair(leftPanelOpen),
  menu_book: pair(menuBook),
  monitor_heart: pair(monitorHeart),
  more_vert: pair(moreVert),
  palette: pair(palette),
  photo_camera: pair(photoCamera),
  photo_library: pair(photoLibrary),
  print: pair(print),
  redo: pair(redo),
  rowing: pair(rowing),
  settings: pair(settings, settingsFill),
  share: pair(share),
  undo: pair(undo),
  view_day: pair(viewDay),
  warning: pair(warning),
};

export type IconName = keyof typeof ICONS;
