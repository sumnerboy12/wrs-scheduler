import db from './index.js';

const employeeCount = db.prepare('SELECT COUNT(*) AS c FROM employees').get().c;
if (employeeCount === 0) {
  console.log('Seeding demo data...');

  const insertEmployee = db.prepare(
    `INSERT INTO employees (name, role, email, phone, color) VALUES (?, ?, ?, ?, ?)`
  );
  const employees = [
    ['Dave Munro', 'Foreman', 'dave@example.com', '021 000 001', '#4f7cff'],
    ['Sione Taufa', 'Roofer', 'sione@example.com', '021 000 002', '#e07a5f'],
    ['Mark Reid', 'Roofer', 'mark@example.com', '021 000 003', '#81b29a'],
    ['Josh Peters', 'Apprentice', 'josh@example.com', '021 000 004', '#f2cc8f'],
    ['Aroha Ngata', 'Roofer', 'aroha@example.com', '021 000 005', '#9d79bc'],
    ['Liam Fisher', 'Labourer', 'liam@example.com', '021 000 006', '#3d8fb5'],
  ];
  const employeeIds = employees.map(
    (e) => insertEmployee.run(...e).lastInsertRowid
  );

  const insertClient = db.prepare(`INSERT INTO clients (name, color) VALUES (?, ?)`);
  const client1 = insertClient.run('John Smith', '#2e9e5b').lastInsertRowid;
  const client2 = insertClient.run('Harbourview Body Corp', '#2e6f9e').lastInsertRowid;
  const client3 = insertClient.run('Coastal Homes Ltd', '#9e8a2e').lastInsertRowid;

  const insertJob = db.prepare(
    `INSERT INTO jobs (code, name, client_id, address, status, probability, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (base, n) => {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d;
  };

  const job1 = insertJob.run(
    'J-1001',
    'Smith Residence Reroof',
    client1,
    '12 Totara St, Tauranga',
    'confirmed',
    null,
    'Full tile-to-metal reroof.'
  ).lastInsertRowid;

  const job2 = insertJob.run(
    'J-1002',
    'Harbourview Apartments',
    client2,
    '4 Marina Dr, Mount Maunganui',
    'in_progress',
    null,
    'Large commercial membrane roof, staged by block.'
  ).lastInsertRowid;

  const job3 = insertJob.run(
    'J-1003',
    'Papamoa New Build',
    client3,
    '88 Papamoa Beach Rd, Papamoa',
    'pipeline',
    40,
    'Quote sent, awaiting decision from builder.'
  ).lastInsertRowid;

  const insertPhase = db.prepare(
    `INSERT INTO phases (job_id, name, sequence, start_date, end_date, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const p1 = insertPhase.run(job1, 'Tear-off & Dry-in', 1, iso(addDays(today, 2)), iso(addDays(today, 4)), '').lastInsertRowid;
  const p2 = insertPhase.run(job1, 'Install', 2, iso(addDays(today, 5)), iso(addDays(today, 9)), '').lastInsertRowid;
  const p3 = insertPhase.run(job1, 'Flashing & Clean-up', 3, iso(addDays(today, 10)), iso(addDays(today, 11)), '').lastInsertRowid;

  const p4 = insertPhase.run(job2, 'Block A - Strip', 1, iso(addDays(today, 0)), iso(addDays(today, 6)), '').lastInsertRowid;
  const p5 = insertPhase.run(job2, 'Block A - Membrane', 2, iso(addDays(today, 7)), iso(addDays(today, 16)), '').lastInsertRowid;
  const p6 = insertPhase.run(job2, 'Block B - Strip', 3, iso(addDays(today, 17)), iso(addDays(today, 22)), '').lastInsertRowid;

  const p7 = insertPhase.run(job3, 'Roofing (proposed)', 1, iso(addDays(today, 30)), iso(addDays(today, 40)), 'Tentative - pipeline job').lastInsertRowid;

  const insertAssignment = db.prepare(
    `INSERT INTO assignments (phase_id, employee_id, start_date, end_date, allocation_pct, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const [dave, sione, mark, josh, aroha, liam] = employeeIds;

  insertAssignment.run(p1, dave, iso(addDays(today, 2)), iso(addDays(today, 4)), 100, '');
  insertAssignment.run(p1, sione, iso(addDays(today, 2)), iso(addDays(today, 4)), 100, '');
  insertAssignment.run(p2, dave, iso(addDays(today, 5)), iso(addDays(today, 9)), 100, '');
  insertAssignment.run(p2, sione, iso(addDays(today, 5)), iso(addDays(today, 9)), 100, '');
  insertAssignment.run(p2, josh, iso(addDays(today, 5)), iso(addDays(today, 9)), 50, '');
  insertAssignment.run(p3, dave, iso(addDays(today, 10)), iso(addDays(today, 11)), 100, '');

  insertAssignment.run(p4, mark, iso(addDays(today, 0)), iso(addDays(today, 6)), 100, '');
  insertAssignment.run(p4, aroha, iso(addDays(today, 0)), iso(addDays(today, 6)), 100, '');
  insertAssignment.run(p4, liam, iso(addDays(today, 0)), iso(addDays(today, 6)), 100, '');
  insertAssignment.run(p5, mark, iso(addDays(today, 7)), iso(addDays(today, 16)), 100, '');
  insertAssignment.run(p5, aroha, iso(addDays(today, 7)), iso(addDays(today, 16)), 100, '');
  // Intentional overallocation example: Josh double-booked across two jobs
  insertAssignment.run(p6, josh, iso(addDays(today, 6)), iso(addDays(today, 8)), 100, 'Overlaps with Smith Residence install');

  insertAssignment.run(p7, mark, iso(addDays(today, 30)), iso(addDays(today, 40)), 100, 'Tentative allocation for pipeline job');

  console.log('Seed complete.');
} else {
  console.log('Database already has data, skipping seed.');
}
