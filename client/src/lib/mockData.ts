export interface DiscoveryEvent {
  id: string
  title: string
  blurb: string
  cat: 'music' | 'sports' | 'food' | 'workshop' | 'art' | 'market'
  source: 'ticket' | 'eventbrite' | 'meetup'
  date: string
  time: string
  venue: string
  area: string
  price: string
  priceVal: number | null   // null = price unknown (must not read as free)
  attendees: number
  going: string[]
  organiser: string
  saved?: boolean
  image?: string            // real cover image (Ticketmaster)
  startISO?: string         // machine-readable start datetime for filtering/saving
  url?: string              // external ticket link
}

export const MOCK_MEMBERS: Record<string, { name: string; first: string; hue: number }> = {
  you:   { name: 'You',          first: 'Y', hue: 252 },
  amir:  { name: 'Amir Hassan',  first: 'A', hue: 30  },
  noor:  { name: 'Noor El-Amin', first: 'N', hue: 190 },
  june:  { name: 'June Park',    first: 'J', hue: 330 },
  luca:  { name: 'Luca Rossi',   first: 'L', hue: 145 },
  maya:  { name: 'Maya Torres',  first: 'M', hue: 280 },
}

export const MOCK_DISCOVERY: DiscoveryEvent[] = [
  {
    id: 'd1',
    title: 'Bicep — Live at Ancienne Belgique',
    blurb: 'Ireland\'s acclaimed electronic duo return to Brussels for a sold-out show. Expect their signature blend of melancholic house and euphoric techno.',
    cat: 'music',
    source: 'ticket',
    date: '6 Jun',
    time: '20:00',
    venue: 'Ancienne Belgique',
    area: 'Centre',
    price: '€35',
    priceVal: 35,
    attendees: 2000,
    going: ['amir', 'noor'],
    organiser: 'Ancienne Belgique',
  },
  {
    id: 'd2',
    title: 'Brussels Trail Runners — Sunday Long Run',
    blurb: 'Weekly long run through the Forêt de Soignes. All paces welcome. Meet at the main parking.',
    cat: 'sports',
    source: 'meetup',
    date: '7 Jun',
    time: '08:30',
    venue: 'Forêt de Soignes',
    area: 'Uccle',
    price: 'Free',
    priceVal: 0,
    attendees: 34,
    going: ['june'],
    organiser: 'Brussels Trail Runners',
  },
  {
    id: 'd3',
    title: 'Natural Wine Market — Place du Châtelain',
    blurb: 'Over 20 natural wine producers from Belgium, France, and beyond. Tastings, bottles to take home, and local food stalls.',
    cat: 'market',
    source: 'eventbrite',
    date: '7 Jun',
    time: '11:00',
    venue: 'Place du Châtelain',
    area: 'Ixelles',
    price: 'Free',
    priceVal: 0,
    attendees: 412,
    going: ['amir', 'maya', 'luca'],
    organiser: 'Châtelain Market',
  },
  {
    id: 'd4',
    title: 'Intro to Ceramics — Weekend Workshop',
    blurb: 'Two-day wheel-throwing workshop for beginners. All materials included. Limited to 8 participants.',
    cat: 'workshop',
    source: 'eventbrite',
    date: '8 Jun',
    time: '10:00',
    venue: 'Atelier Argile',
    area: 'Molenbeek',
    price: '€120',
    priceVal: 120,
    attendees: 8,
    going: [],
    organiser: 'Atelier Argile',
  },
  {
    id: 'd5',
    title: 'Boiler Room Brussels — Open Air Edition',
    blurb: 'An afternoon of electronic music in a rooftop setting. Lineup TBA. Bring sunscreen.',
    cat: 'music',
    source: 'ticket',
    date: '8 Jun',
    time: '14:00',
    venue: 'Tour & Taxis Rooftop',
    area: 'Laeken',
    price: '€18',
    priceVal: 18,
    attendees: 600,
    going: ['noor', 'june', 'luca'],
    organiser: 'Boiler Room',
  },
  {
    id: 'd6',
    title: 'Moeder Lambic Tap Takeover — Cantillon Special',
    blurb: 'Rare Cantillon lambics on draft for one night only. Reserve your spot — seating is limited.',
    cat: 'food',
    source: 'meetup',
    date: '9 Jun',
    time: '18:30',
    venue: 'Moeder Lambic Fontainas',
    area: 'Saint-Gilles',
    price: '€12',
    priceVal: 12,
    attendees: 60,
    going: ['amir'],
    organiser: 'Moeder Lambic',
  },
  {
    id: 'd7',
    title: 'Brussels Photo Week — Opening Night',
    blurb: 'The city\'s biggest photography festival opens with a vernissage across 12 venues simultaneously.',
    cat: 'art',
    source: 'eventbrite',
    date: '10 Jun',
    time: '19:00',
    venue: 'BOZAR',
    area: 'Centre',
    price: 'Free',
    priceVal: 0,
    attendees: 1200,
    going: ['maya'],
    organiser: 'Brussels Photo Week',
  },
  {
    id: 'd8',
    title: 'Red Star FC vs Anderlecht — Friendly',
    blurb: 'Pre-season friendly at the newly renovated Stade Émile Versé. Great atmosphere guaranteed.',
    cat: 'sports',
    source: 'ticket',
    date: '11 Jun',
    time: '15:00',
    venue: 'Stade Émile Versé',
    area: 'Forest',
    price: '€10',
    priceVal: 10,
    attendees: 3500,
    going: ['luca', 'amir'],
    organiser: 'Red Star FC',
  },
]
