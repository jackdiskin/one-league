// Primary team colours for the list's identity chip.
//
// Lives here rather than in lib/ because lib/ is out of scope for this
// redesign. Keys match the team_code values in the players table, the same
// set lib/team-logos.ts uses.
export const TEAM_COLORS: Record<string, string> = {
  ARI: '#97233F', ATL: '#A71930', BAL: '#241773', BUF: '#00338D',
  CAR: '#0085CA', CHI: '#0B162A', CIN: '#FB4F14', CLE: '#311D00',
  DAL: '#041E42', DEN: '#FB4F14', DET: '#0076B6', GB:  '#203731',
  HOU: '#03202F', IND: '#002C5F', JAX: '#006778', KC:  '#E31837',
  LAC: '#0080C6', LAR: '#003594', LV:  '#000000', MIA: '#008E97',
  MIN: '#4F2683', NE:  '#002244', NO:  '#D3BC8D', NYG: '#0B2265',
  NYJ: '#125740', PHI: '#004C54', PIT: '#FFB612', SEA: '#002244',
  SF:  '#AA0000', TB:  '#D50A0A', TEN: '#0C2340', WAS: '#5A1414',
};

export function teamColor(code: string | null | undefined): string {
  return (code && TEAM_COLORS[code]) || '#71717A';
}
