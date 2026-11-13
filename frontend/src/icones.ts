// Ícones do Google Material Symbols, estilo "outlined", peso 400 (pacote @material-symbols/svg-400, licença
// Apache 2.0). Só os que o app usa entram no site: cada SVG é importado como texto e só o traço é aproveitado.
import add from '@material-symbols/svg-400/outlined/add.svg?raw'
import bedtime from '@material-symbols/svg-400/outlined/bedtime.svg?raw'
import checkCircle from '@material-symbols/svg-400/outlined/check_circle.svg?raw'
import chevronLeft from '@material-symbols/svg-400/outlined/chevron_left.svg?raw'
import chevronRight from '@material-symbols/svg-400/outlined/chevron_right.svg?raw'
import coffee from '@material-symbols/svg-400/outlined/coffee.svg?raw'
import deleteIcon from '@material-symbols/svg-400/outlined/delete.svg?raw'
import dinnerDining from '@material-symbols/svg-400/outlined/dinner_dining.svg?raw'
import edit from '@material-symbols/svg-400/outlined/edit.svg?raw'
import eggAlt from '@material-symbols/svg-400/outlined/egg_alt.svg?raw'
import grain from '@material-symbols/svg-400/outlined/grain.svg?raw'
import home from '@material-symbols/svg-400/outlined/home.svg?raw'
import info from '@material-symbols/svg-400/outlined/info.svg?raw'
import keyboardArrowDown from '@material-symbols/svg-400/outlined/keyboard_arrow_down.svg?raw'
import keyboardArrowUp from '@material-symbols/svg-400/outlined/keyboard_arrow_up.svg?raw'
import menu from '@material-symbols/svg-400/outlined/menu.svg?raw'
import menuBook from '@material-symbols/svg-400/outlined/menu_book.svg?raw'
import notifications from '@material-symbols/svg-400/outlined/notifications.svg?raw'
import nutrition from '@material-symbols/svg-400/outlined/nutrition.svg?raw'
import opacity from '@material-symbols/svg-400/outlined/opacity.svg?raw'
import restaurant from '@material-symbols/svg-400/outlined/restaurant.svg?raw'
import schedule from '@material-symbols/svg-400/outlined/schedule.svg?raw'
import star from '@material-symbols/svg-400/outlined/star.svg?raw'
import warning from '@material-symbols/svg-400/outlined/warning.svg?raw'
import waterDrop from '@material-symbols/svg-400/outlined/water_drop.svg?raw'

const caminho = (svg: string) => [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1])

export const caminhos = {
  // Interface
  alerta: caminho(warning),
  ok: caminho(checkCircle),
  info: caminho(info),
  sino: caminho(notifications),
  mais: caminho(add),
  lixeira: caminho(deleteIcon),
  lapis: caminho(edit),
  estrela: caminho(star),
  relogio: caminho(schedule),
  'seta-esq': caminho(chevronLeft),
  'seta-dir': caminho(chevronRight),
  'chevron-dir': caminho(chevronRight),
  'chevron-baixo': caminho(keyboardArrowDown),
  expandir: caminho(keyboardArrowDown),
  recolher: caminho(keyboardArrowUp),
  // Navegação
  casa: caminho(home),
  prato: caminho(menuBook),
  gota: caminho(waterDrop),
  menu: caminho(menu),
  // Refeições
  cafe: caminho(coffee),
  lanche: caminho(nutrition),
  almoco: caminho(restaurant),
  jantar: caminho(dinnerDining),
  ceia: caminho(bedtime),
  refeicao: caminho(restaurant),
  // Macronutrientes
  carbo: caminho(grain),
  proteina: caminho(eggAlt),
  gordura: caminho(opacity),
} as const

export type NomeIcone = keyof typeof caminhos

/** Ícone de uma refeição pelo nome ("Café da manhã", "Lanche da tarde", "Almoço", "Jantar", "Ceia"). */
export function iconeDaRefeicao(nome: string): NomeIcone {
  const n = nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  if (n.includes('cafe') || n.includes('desjejum')) return 'cafe'
  if (n.includes('lanche') || n.includes('colacao')) return 'lanche'
  if (n.includes('almoc')) return 'almoco'
  if (n.includes('jant')) return 'jantar'
  if (n.includes('ceia')) return 'ceia'
  return 'refeicao'
}
