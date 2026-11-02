// Fills a co-op with realistic sample data for demos, using the app's own API.
//
//   BASE_URL=https://kithwheel.org DEMO_EMAIL=demo@kithwheel.org DEMO_PASSWORD=... \
//     COOP_NAME="Maple Grove Homeschool Co-op" node scripts/seed-demo.mjs
//
// It signs in as the demo coordinator, creates the co-op if it doesn't exist, and adds
// classes, a published schedule, settings, families, payments, volunteer hours and
// attendance. Sample families use Resend test addresses (delivered+name@resend.dev): announcements to them succeed without emailing anyone.
// If the co-op already has a published schedule, its classes and rotations are kept and
// just given seats, fees and materials. Run it once; running it again adds more families.

const base = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const email = process.env.DEMO_EMAIL;
const password = process.env.DEMO_PASSWORD;
const coopName = process.env.COOP_NAME ?? 'Maple Grove Homeschool Co-op';
if (!email || !password) {
  console.error('Set DEMO_EMAIL and DEMO_PASSWORD.');
  process.exit(1);
}

let cookie = '';
async function call(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { origin: base, 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((line) => line.split(';')[0]).join('; ');
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}

const iso = (date) => date.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 86_400_000));

await call('POST', '/api/auth/sign-in/email', { email, password });
const coops = await call('GET', '/api/coops');
let coop = coops.items.find((item) => item.name === coopName);
if (!coop) coop = await call('POST', '/api/coops', { name: coopName });
const id = coop.id;
console.log(`Seeding ${coop.name} (${id}) on ${base}`);

const existing = await call('GET', `/api/coops/${id}/schedules`);
const current = existing.items.find((item) => item.id === existing.currentScheduleId);
let rotations; // [{ ageGroup, classIds }]

if (current) {
  // Keep the co-op's own schedule; add seats, fees and materials to its classes.
  const extras = [
    [6, 1500, 'Sketchbook, colored pencils, clipboard'],
    [10, 0, 'A favorite picture book to share'],
    [5, 2500, 'Safety goggles (provided), old T-shirt'],
    [10, 2000, 'Smock or old shirt'],
    [14, 0, 'Folder and pencil'],
    [null, 1000, 'Sneakers and a water bottle'],
  ];
  const seen = new Set();
  let index = 0;
  for (const rotation of current.rotations) {
    for (const entry of rotation.entries) {
      if (seen.has(entry.class.id)) continue;
      seen.add(entry.class.id);
      const [capacity, feeCents, materials] = extras[index % extras.length];
      index += 1;
      await call('PATCH', `/api/coops/${id}/classes/${entry.class.id}`, {
        capacity,
        feeCents,
        materials,
      });
    }
  }
  rotations = current.rotations.map((rotation) => ({
    ageGroup: rotation.ageGroup,
    classIds: rotation.entries.map((entry) => entry.class.id),
  }));
} else {
  const classSpecs = [
    [
      'Nature Journaling',
      'Ms. Rivera',
      'Garden room',
      '9:00-9:50',
      10,
      1500,
      'Sketchbook, colored pencils, clipboard',
    ],
    [
      'Story Circle',
      'Mrs. Okafor',
      'Library',
      '10:00-10:50',
      12,
      0,
      'A favorite picture book to share',
    ],
    ['Choir', 'Mrs. Lindqvist', 'Fellowship hall', '11:00-11:50', null, 0, null],
    [
      'Hands-on Science',
      'Mr. Chen',
      'Room 3',
      '9:00-9:50',
      5,
      2500,
      'Safety goggles (provided), old T-shirt',
    ],
    ['Art Studio', 'Ms. Patel', 'Art room', '10:00-10:50', 10, 2000, 'Smock or old shirt'],
    ['Fifty Nifty States', 'Mr. Benson', 'Room 1', '11:00-11:50', 14, 0, 'Folder and pencil'],
    ['Creative Writing', 'Ms. Grant', 'Library', '9:00-9:50', 10, 0, 'Composition notebook'],
    [
      'Physical Education',
      'Coach Dunn',
      'Gym',
      '10:00-10:50',
      null,
      1000,
      'Sneakers and a water bottle',
    ],
    ['Debate Club', 'Mr. Ortiz', 'Room 2', '11:00-11:50', 12, 0, null],
  ];
  const ids = [];
  for (const [name, teacher, room, time, capacity, feeCents, materials] of classSpecs) {
    const created = await call('POST', `/api/coops/${id}/classes`, {
      name,
      teacher,
      room,
      time,
      capacity,
      feeCents,
      ...(materials ? { materials } : {}),
    });
    ids.push(created.id);
  }
  rotations = [
    { ageGroup: 'Ages 5-7', classIds: ids.slice(0, 3) },
    { ageGroup: 'Ages 8-10', classIds: ids.slice(3, 6) },
    { ageGroup: 'Ages 11-14', classIds: ids.slice(6, 9) },
  ];
  const schedules = await call('POST', `/api/coops/${id}/schedules`, { title: 'Spring 2027 Term' });
  const scheduleId = schedules.items[0].id;
  await call('PATCH', `/api/coops/${id}/schedules/${scheduleId}`, { rotations });
  await call('POST', `/api/coops/${id}/schedules/${scheduleId}/publish`, {});
}

const before = await call('GET', `/api/coops/${id}/settings`);
if (!before.shareUrl) await call('POST', `/api/coops/${id}/share`, {});
await call('PATCH', `/api/coops/${id}/settings`, {
  meetingDay: 2,
  termStart: '2027-01-12',
  termEnd: '2027-05-04',
  timeZone: 'America/New_York',
  familyFeeCents: 7500,
  childFeeCents: 2500,
  volunteerMinutesRequired: 10 * 60,
  paymentInstructions:
    'Venmo @maple-grove-coop, or bring a check made out to Maple Grove Co-op on co-op day.',
  registrationOpen: true,
  registrationNote:
    'Spring registration is open through January 5. New families: we’d love to meet you first, so reply to your confirmation email with any questions.',
});
if (!before.kioskUrl) await call('POST', `/api/coops/${id}/kiosk`, {});

// [parent, [[child, rotation index, class positions in that rotation]]]
const families = [
  [
    'Jordan Avery',
    [
      ['Mia Avery', 0, [0, 1]],
      ['Leo Avery', 1, [0, 2]],
    ],
  ],
  ['Priya Shah', [['Anika Shah', 1, [1, 0]]]],
  [
    'Sam & Dana Brooks',
    [
      ['Eli Brooks', 2, [0, 1]],
      ['Ruby Brooks', 0, [2, 0]],
    ],
  ],
  [
    'Maria Gonzalez',
    [
      ['Sofia Gonzalez', 1, [1, 2]],
      ['Mateo Gonzalez', 0, [1]],
    ],
  ],
  ['Hannah Kim', [['Grace Kim', 2, [0, 2]]]],
  [
    'Tom Whitaker',
    [
      ['Owen Whitaker', 1, [0, 1]],
      ['Lily Whitaker', 1, [0, 2]],
    ],
  ],
  ['Aisha Bello', [['Zara Bello', 0, [0, 2]]]],
  [
    'Chris Novak',
    [
      ['Ivy Novak', 1, [0, 1]],
      ['Max Novak', 2, [1]],
    ],
  ],
  ['Rebecca Stone', [['Noah Stone', 1, [0, 1]]]],
  ['Daniel Park', [['Hazel Park', 1, [0, 2]]]],
];
let overview;
for (const [parentName, children] of families) {
  const slug = parentName
    .toLowerCase()
    .replace(/[^a-z]+/g, '.')
    .replace(/^\.|\.$/g, '');
  // Families that already exist (same email) are skipped, so the script can be rerun.
  await call('POST', `/api/coops/${id}/families`, {
    parentName,
    email: `delivered+${slug.replace(/\./g, "-")}@resend.dev`,
    phone: `(215) 555-01${String(Math.floor(Math.random() * 90) + 10)}`,
    sendEmail: false,
    children: children.map(([name, rotationIndex, positions]) => {
      const rotation = rotations[rotationIndex % rotations.length];
      return {
        name,
        ageGroup: rotation.ageGroup,
        classIds: [
          ...new Set(
            positions.map((position) => rotation.classIds[position % rotation.classIds.length]),
          ),
        ],
      };
    }),
  }).catch((error) => {
    if (!String(error.message).includes('409')) throw error;
  });
}
overview = await call('GET', `/api/coops/${id}/families`);

const byName = Object.fromEntries(overview.families.map((family) => [family.parentName, family]));
const payments = [
  ['Jordan Avery', 22500, 'Venmo'],
  ['Priya Shah', 14500, 'Check'],
  ['Sam & Dana Brooks', 10000, 'Cash'],
  ['Hannah Kim', 10000, 'Venmo'],
  ['Tom Whitaker', 20000, 'Zelle'],
];
for (const [name, amountCents, method] of payments) {
  await call('POST', `/api/coops/${id}/families/${byName[name].id}/payments`, {
    amountCents,
    method,
    paidOn: daysAgo(10),
  });
}
await call('POST', `/api/coops/${id}/families/${byName['Maria Gonzalez'].id}/charges`, {
  description: 'Sibling discount',
  amountCents: -2500,
});

const hours = [
  ['Jordan Avery', 180, 'Set-up crew'],
  ['Jordan Avery', 120, 'Taught a guest lesson'],
  ['Priya Shah', 240, 'Field trip chaperone'],
  ['Sam & Dana Brooks', 90, 'Cleaning crew'],
  ['Hannah Kim', 300, 'Organized the book swap'],
  ['Tom Whitaker', 60, 'Snack table'],
];
for (const [name, minutes, description] of hours) {
  await call('POST', `/api/coops/${id}/volunteer`, {
    familyId: byName[name].id,
    date: daysAgo(14),
    minutes,
    description,
  });
}

// Two weeks of attendance.
const allChildren = overview.families.flatMap((family) => family.children);
for (const [offset, absentees] of [
  [14, ['Max Novak']],
  [7, ['Grace Kim', 'Zara Bello']],
]) {
  for (const child of allChildren) {
    await call('POST', `/api/coops/${id}/attendance`, {
      childId: child.id,
      date: daysAgo(offset),
      action: absentees.includes(child.name) ? 'absent' : 'check_in',
    });
  }
}

const settings = await call('GET', `/api/coops/${id}/settings`);
console.log('Done.');
console.log(`Family link: ${settings.shareUrl}`);
console.log(`Check-in tablet: ${settings.kioskUrl}`);
console.log(`A family page: ${overview.families[0].familyUrl}`);
