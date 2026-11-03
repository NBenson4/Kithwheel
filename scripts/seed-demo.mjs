// Fills a co-op with realistic sample data for demos, using the app's own API.
//
//   BASE_URL=https://kithwheel.org DEMO_EMAIL=demo@kithwheel.org DEMO_PASSWORD=... \
//     COOP_NAME="Maple Grove Homeschool Co-op" node scripts/seed-demo.mjs
//
// It signs in as the demo coordinator, creates the co-op if it doesn't exist, and lays out a
// schedule for each grade section (Pre-K to 8th–12th), approved. Classes that already exist
// (by name) are moved into their grade instead of duplicated; leftover non-grade sections are
// emptied and removed. New sample families are added once, placed in sections, with a couple
// of single-class exceptions, fees, payments, volunteer hours and attendance.
// Sample families use Resend test addresses (delivered+name@resend.dev): announcements to them
// succeed without emailing anyone.

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

// [section, [[class, teacher, room, time, capacity, feeCents, materials]]]
const LAYOUT = [
  [
    'Pre-K',
    [
      [
        'Story Time & Crafts',
        'Mrs. Okafor',
        'Library',
        '9:00-9:50',
        10,
        1000,
        'Smock or old shirt',
      ],
      ['Music & Movement', 'Mrs. Lindqvist', 'Fellowship hall', '10:00-10:50', null, 0, null],
    ],
  ],
  [
    'Kindergarten',
    [
      ['Phonics Games', 'Ms. Grant', 'Room 1', '9:00-9:50', 10, 0, 'Pencil box'],
      [
        'Nature Journaling',
        'Ms. Rivera',
        'Garden room',
        '10:00-10:50',
        10,
        1500,
        'Sketchbook, colored pencils',
      ],
    ],
  ],
  [
    '1st grade',
    [
      ['Reading Circle', 'Mrs. Okafor', 'Library', '9:00-9:50', 12, 0, 'A favorite picture book'],
      ['Art Studio', 'Ms. Patel', 'Art room', '10:00-10:50', 10, 2000, 'Smock or old shirt'],
    ],
  ],
  [
    '2nd grade',
    [
      ['Math Games', 'Mr. Chen', 'Room 3', '9:00-9:50', 12, 0, 'Folder'],
      [
        'PE: Outside Games',
        'Coach Dunn',
        'Field',
        '10:00-10:50',
        null,
        1000,
        'Sneakers and a water bottle',
      ],
    ],
  ],
  [
    '3rd grade',
    [
      ['Fifty Nifty States', 'Mr. Benson', 'Room 1', '9:00-9:50', 14, 0, 'Folder and pencil'],
      ['Creative Writing', 'Ms. Grant', 'Library', '10:00-10:50', 10, 0, 'Composition notebook'],
    ],
  ],
  [
    '4th grade',
    [
      ['Body Systems Lab', 'Ms. Myiah', 'Room 2', '9:00-9:50', 12, 2500, 'Lab notebook'],
      ['Choir', 'Mrs. Lindqvist', 'Fellowship hall', '10:00-10:50', null, 0, null],
    ],
  ],
  [
    '5th grade',
    [
      [
        'Chemistry Basics',
        'Mr. Chen',
        'Room 3',
        '9:00-9:50',
        10,
        2500,
        'Safety goggles (provided)',
      ],
      ['Robotics Club', 'Mr. Ortiz', 'Room 4', '10:00-10:50', 8, 3000, null],
    ],
  ],
  [
    '6th–7th grade',
    [
      ['Pre-Algebra', 'Mrs. Kim', 'Room 2', '10:00-10:50', 12, 0, 'Graph paper notebook'],
      ['World History', 'Mr. Benson', 'Room 1', '11:00-11:50', 14, 0, null],
    ],
  ],
  [
    '8th–12th grade',
    [
      ['Biology', 'Dr. Shah', 'Room 3', '11:00-11:50', 12, 3500, 'Lab notebook'],
      ['Debate', 'Mr. Ortiz', 'Library', '1:00-1:50', 12, 0, null],
    ],
  ],
];

await call('POST', '/api/auth/sign-in/email', { email, password });
const coops = await call('GET', '/api/coops');
let coop = coops.items.find((item) => item.name === coopName);
if (!coop) coop = await call('POST', '/api/coops', { name: coopName });
const id = coop.id;
console.log(`Seeding ${coop.name} (${id}) on ${base}`);

let sections = (await call('GET', `/api/coops/${id}/sections`)).items;
const sectionByName = (name) => sections.find((item) => item.name === name);
for (const [name] of LAYOUT) {
  if (!sectionByName(name)) {
    sections = (await call('POST', `/api/coops/${id}/sections`, { name })).items;
  }
}

// Classes: move existing ones (by name) into their grade, create the rest.
const existing = (await call('GET', `/api/coops/${id}/classes`)).items;
const classIds = {};
for (const [sectionName, classes] of LAYOUT) {
  const sectionId = sectionByName(sectionName).id;
  for (const [name, teacher, room, time, capacity, feeCents, materials] of classes) {
    const fields = {
      sectionId,
      teacher,
      room,
      time,
      capacity,
      feeCents,
      ...(materials ? { materials } : {}),
    };
    const found = existing.find((item) => item.name.toLowerCase() === name.toLowerCase());
    const saved = found
      ? await call('PATCH', `/api/coops/${id}/classes/${found.id}`, fields)
      : await call('POST', `/api/coops/${id}/classes`, { name, ...fields });
    classIds[name] = saved.id;
  }
}

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
    'Spring registration is open through January 5. Choose each child’s grade; our coordinators will confirm their section.',
});
const before = await call('GET', `/api/coops/${id}/settings`);
if (!before.shareUrl) await call('POST', `/api/coops/${id}/share`, {});
if (!before.kioskUrl) await call('POST', `/api/coops/${id}/kiosk`, {});

// Families: [parent, [[child, grade]]]
const FAMILIES = [
  [
    'Jordan Avery',
    [
      ['Mia Avery', 'Kindergarten'],
      ['Leo Avery', '3rd grade'],
    ],
  ],
  ['Priya Shah', [['Anika Shah', '4th grade']]],
  [
    'Sam & Dana Brooks',
    [
      ['Eli Brooks', '8th–12th grade'],
      ['Ruby Brooks', 'Pre-K'],
    ],
  ],
  [
    'Maria Gonzalez',
    [
      ['Sofia Gonzalez', '2nd grade'],
      ['Mateo Gonzalez', '1st grade'],
    ],
  ],
  ['Hannah Kim', [['Grace Kim', '6th–7th grade']]],
  [
    'Tom Whitaker',
    [
      ['Owen Whitaker', '5th grade'],
      ['Lily Whitaker', '3rd grade'],
    ],
  ],
  ['Aisha Bello', [['Zara Bello', 'Kindergarten']]],
  [
    'Chris Novak',
    [
      ['Ivy Novak', '4th grade'],
      ['Max Novak', '6th–7th grade'],
    ],
  ],
  ['Rebecca Stone', [['Noah Stone', '2nd grade']]],
  ['Daniel Park', [['Hazel Park', '1st grade']]],
];
const gradeOf = Object.fromEntries(FAMILIES.flatMap(([, kids]) => kids));
let overview = await call('GET', `/api/coops/${id}/families`);
const firstRun = overview.families.length === 0;
if (firstRun) {
  for (const [parentName, children] of FAMILIES) {
    const slug = parentName
      .toLowerCase()
      .replace(/[^a-z]+/g, '-')
      .replace(/^-|-$/g, '');
    await call('POST', `/api/coops/${id}/families`, {
      parentName,
      email: `delivered+${slug}@resend.dev`,
      phone: `(215) 555-01${String(Math.floor(Math.random() * 90) + 10)}`,
      sendEmail: false,
      children: children.map(([name, grade]) => ({
        name,
        grade,
        sectionId: sectionByName(grade).id,
      })),
    });
  }
  overview = await call('GET', `/api/coops/${id}/families`);
}

// Place every child in their grade's section (children not in the list keep their grade request).
const allChildren = overview.families.flatMap((family) => family.children);
const members = new Map(LAYOUT.map(([name]) => [name, []]));
for (const child of allChildren) {
  const grade =
    gradeOf[child.name] ?? (members.has(child.requestedSection) ? child.requestedSection : null);
  if (grade) members.get(grade).push(child.id);
}
for (const [name, childIds] of members) {
  await call('PUT', `/api/coops/${id}/sections/${sectionByName(name).id}/children`, { childIds });
}

// Leftover sections that aren't grades (from the old age groups) are removed once empty.
sections = (await call('GET', `/api/coops/${id}/sections`)).items;
const gradeNames = new Set(LAYOUT.map(([name]) => name));
for (const section of sections) {
  if (gradeNames.has(section.name)) continue;
  if (section.classes.length) {
    console.log(`Keeping "${section.name}": it still has classes not in the demo layout.`);
    continue;
  }
  await call('PUT', `/api/coops/${id}/sections/${section.id}/children`, { childIds: [] });
  await call('DELETE', `/api/coops/${id}/sections/${section.id}`);
}

// Approve every grade's schedule.
for (const [name] of LAYOUT) {
  await call('PATCH', `/api/coops/${id}/sections/${sectionByName(name).id}`, {
    status: 'approved',
  });
}

// Case-by-case: Leo (3rd grade) takes 4th-grade Body Systems Lab and skips Fifty Nifty States,
// which meets at the same time.
const leo = allChildren.find((child) => child.name === 'Leo Avery');
if (leo) {
  await call('POST', `/api/coops/${id}/children/${leo.id}/exceptions`, {
    classId: classIds['Body Systems Lab'],
    kind: 'add',
  }).catch(() => undefined);
  await call('POST', `/api/coops/${id}/children/${leo.id}/exceptions`, {
    classId: classIds['Fifty Nifty States'],
    kind: 'skip',
  }).catch(() => undefined);
}

if (firstRun) {
  overview = await call('GET', `/api/coops/${id}/families`);
  const byName = Object.fromEntries(overview.families.map((family) => [family.parentName, family]));
  for (const [name, amountCents, method] of [
    ['Jordan Avery', 22500, 'Venmo'],
    ['Priya Shah', 14500, 'Check'],
    ['Sam & Dana Brooks', 10000, 'Cash'],
    ['Hannah Kim', 10000, 'Venmo'],
    ['Tom Whitaker', 20000, 'Zelle'],
  ]) {
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
  for (const [name, minutes, description] of [
    ['Jordan Avery', 180, 'Set-up crew'],
    ['Priya Shah', 240, 'Field trip chaperone'],
    ['Sam & Dana Brooks', 90, 'Cleaning crew'],
    ['Hannah Kim', 300, 'Organized the book swap'],
    ['Tom Whitaker', 60, 'Snack table'],
  ]) {
    await call('POST', `/api/coops/${id}/volunteer`, {
      familyId: byName[name].id,
      date: daysAgo(14),
      minutes,
      description,
    });
  }
  const kids = overview.families.flatMap((family) => family.children);
  for (const [offset, absentees] of [
    [14, ['Max Novak']],
    [7, ['Grace Kim', 'Zara Bello']],
  ]) {
    for (const child of kids) {
      await call('POST', `/api/coops/${id}/attendance`, {
        childId: child.id,
        date: daysAgo(offset),
        action: absentees.includes(child.name) ? 'absent' : 'check_in',
      });
    }
  }
}

const settings = await call('GET', `/api/coops/${id}/settings`);
console.log('Done.');
console.log(`Family link: ${settings.shareUrl}`);
console.log(`Check-in tablet: ${settings.kioskUrl}`);
