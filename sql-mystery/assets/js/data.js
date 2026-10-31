/* =====================================================================
   ASHVALE CENTRAL RECORDS — the case database
   Every table below is a real SQLite table created in your browser.
   ===================================================================== */

export const SCHEMA_SQL = `
PRAGMA foreign_keys = OFF;

CREATE TABLE suspects (
  suspect_id  INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  alias       TEXT,
  occupation  TEXT    NOT NULL,
  age         INTEGER NOT NULL,
  height_cm   INTEGER NOT NULL,
  district    TEXT    NOT NULL,
  has_alibi   INTEGER NOT NULL,
  risk_score  INTEGER NOT NULL,
  notes       TEXT
);

CREATE TABLE locations (
  location_id    INTEGER PRIMARY KEY,
  name           TEXT    NOT NULL,
  district       TEXT    NOT NULL,
  security_level INTEGER NOT NULL,
  opened_year    INTEGER NOT NULL
);

CREATE TABLE cases (
  case_id        INTEGER PRIMARY KEY,
  title          TEXT NOT NULL,
  status         TEXT NOT NULL,
  opened_on      TEXT NOT NULL,
  closed_on      TEXT,
  lead_detective TEXT NOT NULL
);

CREATE TABLE evidence (
  evidence_id INTEGER PRIMARY KEY,
  case_id     INTEGER NOT NULL,
  item        TEXT    NOT NULL,
  category    TEXT    NOT NULL,
  location_id INTEGER,
  found_on    TEXT    NOT NULL,
  suspect_id  INTEGER
);

CREATE TABLE witnesses (
  witness_id     INTEGER PRIMARY KEY,
  name           TEXT    NOT NULL,
  case_id        INTEGER NOT NULL,
  statement      TEXT    NOT NULL,
  credibility    INTEGER NOT NULL,
  saw_suspect_id INTEGER
);

CREATE TABLE calls (
  call_id      INTEGER PRIMARY KEY,
  caller_id    INTEGER NOT NULL,
  receiver_id  INTEGER NOT NULL,
  call_time    TEXT    NOT NULL,
  duration_sec INTEGER NOT NULL
);

CREATE TABLE transactions (
  txn_id      INTEGER PRIMARY KEY,
  suspect_id  INTEGER NOT NULL,
  amount      REAL    NOT NULL,
  merchant    TEXT    NOT NULL,
  txn_time    TEXT    NOT NULL,
  location_id INTEGER,
  method      TEXT    NOT NULL
);

CREATE TABLE keycard_logs (
  log_id      INTEGER PRIMARY KEY,
  suspect_id  INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  swipe_time  TEXT    NOT NULL,
  direction   TEXT    NOT NULL
);

CREATE TABLE employees (
  employee_id INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  role        TEXT    NOT NULL,
  manager_id  INTEGER,
  salary      INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  hired_on    TEXT    NOT NULL
);

CREATE TABLE vehicles (
  vehicle_id INTEGER PRIMARY KEY,
  suspect_id INTEGER,
  plate      TEXT NOT NULL,
  make       TEXT NOT NULL,
  color      TEXT NOT NULL
);

CREATE TABLE couriers (
  courier_id INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  district   TEXT    NOT NULL,
  active     INTEGER NOT NULL
);

CREATE TABLE shipments (
  shipment_id INTEGER PRIMARY KEY,
  courier_id  INTEGER,
  origin      TEXT    NOT NULL,
  destination TEXT    NOT NULL,
  weight_kg   REAL    NOT NULL,
  ship_date   TEXT    NOT NULL,
  declared    INTEGER NOT NULL
);

CREATE TABLE radio_logs (
  log_id         INTEGER PRIMARY KEY,
  frequency      REAL    NOT NULL,
  broadcast_time TEXT    NOT NULL,
  duration_sec   INTEGER NOT NULL,
  suspect_id     INTEGER,
  message_code   TEXT
);

CREATE TABLE audit_log (
  audit_id   INTEGER PRIMARY KEY,
  table_name TEXT NOT NULL,
  row_id     INTEGER NOT NULL,
  action     TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  old_value  TEXT,
  new_value  TEXT
);

CREATE TABLE scratch_pad (
  pad_id INTEGER PRIMARY KEY,
  junk   TEXT
);
`;

export const SEED_SQL = `
INSERT INTO suspects VALUES
 (1 ,'Dalia Finch'     ,'The Ledger' ,'Bank Clerk'         ,34,165,'Riverside'  ,0,87,'Boarded the 11:05 express the morning after'),
 (2 ,'Oskar Lindqvist' ,'Pour'       ,'Bartender'          ,41,188,'Old Quay'   ,0,74,NULL),
 (3 ,'Marcus Thorne'   ,'The Archivist','Records Archivist',52,176,'Civic Hill' ,1,12,'Bureau employee - above suspicion'),
 (4 ,'Nadia Rook'      ,'Blackbird'  ,'Art Appraiser'      ,38,170,'Gallery Row',1,65,NULL),
 (5 ,'Emil Vance'      ,NULL         ,'Security Chief'     ,47,182,'Gallery Row',1,23,'Signed off on every night roster'),
 (6 ,'Theo Vance'      ,'Little V'   ,'Night Guard'        ,29,181,'Gallery Row',0,81,NULL),
 (7 ,'Priya Raman'     ,'Static'     ,'Radio Engineer'     ,31,158,'Old Quay'   ,0,69,NULL),
 (8 ,'Gus Halloran'    ,'Tin Man'    ,'Courier'            ,45,190,'Riverside'  ,0,58,'Known to run unlogged parcels'),
 (9 ,'Lena Mercer'     ,'Songbird'   ,'Journalist'         ,36,167,'Civic Hill' ,1,31,NULL),
 (10,'Viktor Sandoval' ,'The Baron'  ,'Property Developer' ,59,173,'Civic Hill' ,1,44,NULL),
 (11,'Clara Dupont'    ,NULL         ,'Chemist'            ,43,162,'Riverside'  ,0,77,'Holds a controlled-substances licence'),
 (12,'Ibrahim Osei'    ,'Gears'      ,'Mechanic'           ,50,179,'Old Quay'   ,1,19,NULL),
 (13,'Rosalind Kerr'   ,'The Widow'  ,'Antiques Dealer'    ,61,160,'Gallery Row',0,62,NULL),
 (14,'Danny Pell'      ,'Pell-Mell'  ,'Pickpocket'         ,24,172,'Old Quay'   ,0,53,'Three prior convictions');

INSERT INTO locations VALUES
 (1 ,'Ashvale Central Bank'   ,'Riverside'  ,5,1908),
 (2 ,'The Brass Lantern'      ,'Old Quay'   ,1,1952),
 (3 ,'Vellichor Gallery'      ,'Gallery Row',4,1931),
 (4 ,'Bureau of Forensic Data','Civic Hill' ,5,1974),
 (5 ,'Quayside Warehouse 9'   ,'Old Quay'   ,2,1960),
 (6 ,'Mercer Press Office'    ,'Civic Hill' ,2,1988),
 (7 ,'Riverside Pharmacy'     ,'Riverside'  ,3,1995),
 (8 ,'Sandoval Tower'         ,'Civic Hill' ,4,2011),
 (9 ,'Old Quay Radio Mast'    ,'Old Quay'   ,1,1949),
 (10,'Kerr Antiques'          ,'Gallery Row',2,1966);

INSERT INTO cases VALUES
 (1,'The Midnight Ledger'        ,'open'  ,'2026-01-14',NULL        ,'You'),
 (2,'The Poisoned Pour'          ,'open'  ,'2026-02-02',NULL        ,'You'),
 (3,'The Vellichor Heist'        ,'open'  ,'2026-03-09',NULL        ,'You'),
 (4,'Signal in the Static'       ,'open'  ,'2026-04-21',NULL        ,'You'),
 (5,'Rewriting History'          ,'open'  ,'2026-05-30',NULL        ,'You'),
 (6,'The Harbour Fire'           ,'closed','2025-08-11','2025-09-02','Inspector Hale'),
 (7,'The Kerr Forgeries'         ,'closed','2025-10-03','2025-11-14','Inspector Hale'),
 (8,'The Lantern Street Vanishing','cold' ,'2024-06-17',NULL        ,'Inspector Okonjo');

INSERT INTO evidence VALUES
 (1 ,1,'Torn ledger page'        ,'document',1 ,'2026-01-15',NULL),
 (2 ,1,'Brass vault key'         ,'tool'    ,1 ,'2026-01-15',1),
 (3 ,1,'Muddy boot print'        ,'trace'   ,1 ,'2026-01-15',NULL),
 (4 ,1,'Night-shift sign-in sheet','document',1,'2026-01-16',1),
 (5 ,1,'Cigarette stub'          ,'trace'   ,1 ,'2026-01-16',14),
 (6 ,2,'Shattered highball glass','object'  ,2 ,'2026-02-03',NULL),
 (7 ,2,'Vial of aconite'         ,'chemical',2 ,'2026-02-03',11),
 (8 ,2,'Bar tab receipt'         ,'document',2 ,'2026-02-03',2),
 (9 ,2,'Pharmacy order slip'     ,'document',7 ,'2026-02-05',11),
 (10,2,'Smudged lipstick print'  ,'trace'   ,2 ,'2026-02-04',NULL),
 (11,3,'Cut canvas edge'         ,'trace'   ,3 ,'2026-03-10',NULL),
 (12,3,'Service lift keycard'    ,'tool'    ,3 ,'2026-03-10',6),
 (13,3,'Appraisal certificate'   ,'document',3 ,'2026-03-11',4),
 (14,3,'Rope fibre'              ,'trace'   ,3 ,'2026-03-10',6),
 (15,3,'Gallery floor plan copy' ,'document',10,'2026-03-13',13),
 (16,4,'Shortwave transmitter'   ,'device'  ,9 ,'2026-04-22',7),
 (17,4,'Frequency notebook'      ,'document',9 ,'2026-04-22',7),
 (18,4,'Payment envelope'        ,'object'  ,8 ,'2026-04-25',10),
 (19,4,'Burner handset'          ,'device'  ,5 ,'2026-04-26',8),
 (20,4,'Antenna wire spool'      ,'object'  ,9 ,'2026-04-23',NULL),
 (21,5,'Altered record printout' ,'document',4 ,'2026-05-31',3),
 (22,5,'Archive terminal log'    ,'document',4 ,'2026-05-31',3),
 (23,5,'Master key duplicate'    ,'tool'    ,4 ,'2026-06-02',NULL),
 (25,6,'Scorched mooring rope'   ,'trace'   ,5 ,'2025-08-12',8),
 (26,7,'Forged provenance letter','document',10,'2025-10-04',13),
 (27,8,'Abandoned handbag'       ,'object'  ,2 ,'2024-06-18',NULL);

INSERT INTO witnesses VALUES
 (1 ,'Mirelle Aubert' ,1,'A short figure left the bank by the river door at 00:12.',72,1),
 (2 ,'Pete Okafor'    ,1,'The vault alarm sounded twice, not once.',55,NULL),
 (3 ,'Simone Blake'   ,2,'The woman at the end of the bar never drank anything.',81,11),
 (4 ,'Hal Breen'      ,2,'Oskar poured every single drink himself.',64,2),
 (5 ,'Yusuf Demir'    ,3,'A guard propped the service door open at 02:40.',88,6),
 (6 ,'Tilda Vance'    ,3,'Both my boys were home with me all night.',20,5),
 (7 ,'Anna Petrov'    ,4,'The mast light blinked in sets of three.',76,7),
 (8 ,'Ruth Calloway'  ,4,'A black sedan idled outside the tower for an hour.',69,10),
 (9 ,'Jonas Reed'     ,5,'Only the archivist holds the terminal password.',91,3),
 (10,'Marta Sol'      ,5,'Records changed between my two visits that week.',84,NULL),
 (11,'Benny Shaw'     ,1,'Nothing unusual, officer. Nothing at all.',30,NULL),
 (12,'Ola Nilsen'     ,2,'Clara asked me which glass belonged to the barman.',79,11),
 (13,'Edgar Pym'      ,3,'Rosalind had the floor plan weeks in advance.',58,13),
 (14,'Nina Castellan' ,4,'Priya told me she was being paid in cash.',73,7),
 (15,'Omar Haddad'    ,8,'I have told you people everything I know.',41,NULL),
 (16,'Felix Marsh'    ,5,'The archivist was with me the entire night.',95,3);

INSERT INTO calls VALUES
 (1 , 1,14,'2026-01-13 21:40', 95),
 (2 ,14, 1,'2026-01-13 22:05',180),
 (3 , 1,14,'2026-01-14 23:12', 42),
 (4 , 1,10,'2026-01-14 23:58',610),
 (5 , 2,11,'2026-02-01 18:22',140),
 (6 ,11, 2,'2026-02-01 19:03', 75),
 (7 ,11, 7,'2026-02-02 16:40',320),
 (8 ,11,13,'2026-02-02 20:15', 55),
 (9 , 6, 4,'2026-03-07 13:10',455),
 (10, 4, 6,'2026-03-08 09:45',260),
 (11, 6, 5,'2026-03-09 01:55', 30),
 (12, 6, 4,'2026-03-09 03:20', 90),
 (13,13, 4,'2026-03-05 11:00',205),
 (14, 7,10,'2026-04-01 22:00',740),
 (15, 7,10,'2026-04-05 22:05',690),
 (16, 7,10,'2026-04-09 21:58',805),
 (17, 7,10,'2026-04-13 22:11',760),
 (18, 7,10,'2026-04-17 22:02',880),
 (19, 7,10,'2026-04-21 21:49',915),
 (20,10, 8,'2026-04-22 07:30',120),
 (21, 8,10,'2026-04-25 08:12', 95),
 (22,10, 3,'2026-05-28 19:40',300),
 (23, 3,10,'2026-05-29 20:02',275),
 (25, 3, 9,'2026-05-31 08:30', 60),
 (26, 9, 3,'2026-05-31 09:00', 45),
 (27,14, 2,'2026-01-20 15:00', 70),
 (28,12, 8,'2026-02-14 10:10',150),
 (29, 8,12,'2026-02-14 10:40',130),
 (30, 5, 6,'2026-03-09 04:00', 25),
 (31, 4,13,'2026-03-12 17:30',190),
 (32, 7, 8,'2026-04-18 12:00', 85),
 (33,11, 7,'2026-02-03 09:15',240),
 (34, 1, 9,'2026-01-16 10:00', 35),
 (35, 9, 1,'2026-01-16 10:30', 50),
 (36,10, 7,'2026-04-24 23:30',480),
 (37, 2,14,'2026-01-21 16:45', 65),
 (38,13,10,'2026-03-20 14:00',320),
 (39, 6,14,'2026-03-02 19:19',110),
 (40,12, 5,'2026-03-11 08:00', 90);

INSERT INTO transactions VALUES
 (1 , 1,25000.00,'Harbour Exchange'     ,'2026-01-15 09:20',NULL,'cash'),
 (2 , 1,   48.50,'Riverside Diner'      ,'2026-01-13 12:40',NULL,'card'),
 (3 , 1,  320.00,'Ashvale Rail'         ,'2026-01-15 11:05',NULL,'card'),
 (4 ,14,   15.00,'The Brass Lantern'    ,'2026-01-13 22:30',2   ,'cash'),
 (5 , 2,  210.75,'Quay Wholesale'       ,'2026-02-01 10:15',NULL,'card'),
 (6 ,11,   89.99,'Riverside Pharmacy'   ,'2026-01-29 16:45',7   ,'card'),
 (7 ,11,   12.00,'The Brass Lantern'    ,'2026-02-02 20:40',2   ,'cash'),
 (8 ,11,  450.00,'Bellweather Chemicals','2026-01-27 14:10',NULL,'card'),
 (9 , 6,48000.00,'Unlisted Transfer'    ,'2026-03-10 08:55',NULL,'wire'),
 (10, 6,   36.20,'Gallery Row Cafe'     ,'2026-03-09 18:30',NULL,'card'),
 (11, 4, 1200.00,'Kerr Antiques'        ,'2026-03-12 15:00',10  ,'card'),
 (12,13, 9500.00,'Private Sale'         ,'2026-03-15 13:20',10  ,'wire'),
 (13, 7, 3000.00,'Cash Deposit'         ,'2026-04-22 09:10',NULL,'cash'),
 (14, 7, 3000.00,'Cash Deposit'         ,'2026-04-10 09:05',NULL,'cash'),
 (15, 7, 3000.00,'Cash Deposit'         ,'2026-04-02 08:58',NULL,'cash'),
 (16,10,18000.00,'Sandoval Holdings'    ,'2026-04-21 17:45',8   ,'wire'),
 (17,10,  240.00,'Civic Hill Club'      ,'2026-04-24 21:00',NULL,'card'),
 (18, 8,   75.40,'Quay Fuel'            ,'2026-04-25 06:30',NULL,'card'),
 (19, 8,  500.00,'Unlisted Transfer'    ,'2026-04-25 09:00',NULL,'cash'),
 (20, 3,  150.00,'Civic Hill Books'     ,'2026-05-20 13:00',NULL,'card'),
 (22, 3,   42.00,'Bureau Canteen'       ,'2026-05-31 12:30',4   ,'card'),
 (23, 9,   65.00,'Mercer Press Office'  ,'2026-02-10 10:00',6   ,'card'),
 (24,12,  310.00,'Osei Motors'          ,'2026-03-11 09:40',NULL,'card'),
 (25, 5,  980.00,'Vance Family Trust'   ,'2026-03-20 11:11',NULL,'wire'),
 (26, 2,   15.50,'Quay Newsagent'       ,'2026-02-03 08:00',NULL,'cash'),
 (27,14,    5.00,'Quay Newsagent'       ,'2026-01-14 07:45',NULL,'cash'),
 (28,13,  275.00,'Gallery Row Framing'  ,'2026-03-06 14:30',NULL,'card'),
 (29, 4,   60.00,'Gallery Row Cafe'     ,'2026-03-08 09:00',NULL,'card'),
 (30,11,  199.00,'Bellweather Chemicals','2026-02-01 11:25',NULL,'card'),
 (31, 1,  120.00,'Harbour Exchange'     ,'2025-12-20 10:00',NULL,'cash'),
 (32, 6,   85.00,'Quay Fuel'            ,'2026-03-09 23:40',NULL,'card'),
 (33, 7,   42.75,'Old Quay Diner'       ,'2026-04-21 20:30',NULL,'card'),
 (34,10, 7500.00,'Unlisted Transfer'    ,'2026-04-20 16:00',NULL,'wire');

INSERT INTO keycard_logs VALUES
 (1 , 1,1 ,'2026-01-14 23:40','in' ),
 (2 , 1,1 ,'2026-01-15 00:12','out'),
 (3 ,14,1 ,'2026-01-14 21:15','in' ),
 (4 ,14,1 ,'2026-01-14 21:35','out'),
 (5 , 6,3 ,'2026-03-09 01:50','in' ),
 (6 , 6,3 ,'2026-03-09 02:38','out'),
 (7 , 6,3 ,'2026-03-09 02:41','in' ),
 (8 , 6,3 ,'2026-03-09 03:15','out'),
 (9 , 4,3 ,'2026-03-08 18:05','in' ),
 (10, 4,3 ,'2026-03-08 18:50','out'),
 (11, 5,3 ,'2026-03-09 07:00','in' ),
 (13, 3,4 ,'2026-05-31 02:40','out'),
 (14, 3,4 ,'2026-05-29 09:00','in' ),
 (15, 3,4 ,'2026-05-29 17:30','out'),
 (16, 9,4 ,'2026-05-31 10:00','in' ),
 (17, 9,4 ,'2026-05-31 16:00','out'),
 (18,13,10,'2026-03-05 10:00','in' ),
 (19,11,7 ,'2026-01-29 16:40','in' ),
 (20,11,7 ,'2026-01-29 16:55','out');

INSERT INTO employees VALUES
 (1 ,'Emil Vance'    ,'Security Chief'    ,NULL,72000,3,'2016-04-02'),
 (2 ,'Theo Vance'    ,'Night Guard'       ,1   ,38000,3,'2023-09-11'),
 (3 ,'Yusuf Demir'   ,'Day Guard'         ,1   ,36000,3,'2021-02-15'),
 (4 ,'Nadia Rook'    ,'Appraiser'         ,NULL,81000,3,'2019-06-01'),
 (5 ,'Edgar Pym'     ,'Registrar'         ,4   ,45000,3,'2020-11-20'),
 (6 ,'Marcus Thorne' ,'Records Archivist' ,NULL,69000,4,'2001-03-05'),
 (7 ,'Jonas Reed'    ,'Data Clerk'        ,6   ,41000,4,'2022-07-18'),
 (8 ,'Marta Sol'     ,'Data Clerk'        ,6   ,42500,4,'2024-01-09'),
 (9 ,'Rosalind Kerr' ,'Consultant'        ,4   ,52000,3,'2018-08-30'),
 (10,'Priya Raman'   ,'Signals Technician',NULL,47000,9,'2020-05-14'),
 (11,'Ibrahim Osei'  ,'Facilities'        ,1   ,34000,3,'2017-10-01'),
 (12,'Lena Mercer'   ,'Press Liaison'     ,NULL,58000,6,'2021-01-25');

INSERT INTO vehicles VALUES
 (1, 1   ,'RVS-118','Volvo'  ,'grey'  ),
 (2, 6   ,'GLR-440','Ford'   ,'black' ),
 (3, 10  ,'CVH-001','Bentley','black' ),
 (4, 8   ,'OQY-772','Iveco'  ,'white' ),
 (5, 11  ,'RVS-309','Fiat'   ,'red'   ),
 (6, 13  ,'GLR-205','Jaguar' ,'green' ),
 (7, 3   ,'CVH-884','Skoda'  ,'silver'),
 (8, 2   ,'OQY-156','Honda'  ,'blue'  ),
 (9, NULL,'XXX-000','Unknown','black' );

INSERT INTO couriers VALUES
 (1,'Halloran Haulage','Riverside'  ,1),
 (2,'Quay Runners Ltd','Old Quay'   ,1),
 (3,'Ashvale Post'    ,'Civic Hill' ,1),
 (4,'Pell Express'    ,'Old Quay'   ,0),
 (5,'Kerr Freight'    ,'Gallery Row',1);

INSERT INTO shipments VALUES
 (1 ,1   ,'Riverside'  ,'Old Quay'   , 12.5,'2026-01-16',1),
 (2 ,1   ,'Old Quay'   ,'Riverside'  , 48.0,'2026-01-18',1),
 (3 ,2   ,'Old Quay'   ,'Civic Hill' ,  3.2,'2026-02-04',1),
 (4 ,5   ,'Gallery Row','Old Quay'   ,104.0,'2026-03-09',0),
 (5 ,5   ,'Gallery Row','Riverside'  , 22.8,'2026-03-11',1),
 (6 ,3   ,'Civic Hill' ,'Gallery Row',  1.1,'2026-03-12',1),
 (7 ,1   ,'Riverside'  ,'Civic Hill' , 67.4,'2026-04-22',0),
 (8 ,2   ,'Old Quay'   ,'Gallery Row',  9.9,'2026-04-24',1),
 (9 ,NULL,'Unknown'    ,'Old Quay'   , 55.0,'2026-04-25',0),
 (10,3   ,'Civic Hill' ,'Riverside'  ,  2.4,'2026-05-30',1),
 (11,1   ,'Riverside'  ,'Old Quay'   , 31.0,'2026-05-31',1),
 (12,5   ,'Gallery Row','Civic Hill' , 18.6,'2026-06-01',1);

INSERT INTO radio_logs VALUES
 (1 , 6.215,'2026-04-01 22:00',740,7   ,'TRIPLE-3'),
 (2 , 6.215,'2026-04-05 22:05',690,7   ,'TRIPLE-3'),
 (3 , 6.215,'2026-04-09 21:58',805,7   ,'TRIPLE-3'),
 (4 , 6.215,'2026-04-13 22:11',760,7   ,NULL      ),
 (5 , 6.215,'2026-04-17 22:02',880,7   ,'TRIPLE-3'),
 (6 , 6.215,'2026-04-21 21:49',915,7   ,'TRIPLE-9'),
 (7 , 9.440,'2026-04-02 03:00',120,NULL,NULL      ),
 (8 , 9.440,'2026-04-11 03:02', 95,NULL,'HOLLOW'  ),
 (9 ,11.175,'2026-04-14 19:30',240,8   ,'PARCEL'  ),
 (10,11.175,'2026-04-18 19:33',180,8   ,'PARCEL'  ),
 (11, 6.215,'2026-03-28 22:00',300,7   ,'TEST'    ),
 (12, 4.625,'2026-04-20 01:00', 60,NULL,NULL      ),
 (13, 9.440,'2026-04-23 03:05',110,NULL,'HOLLOW'  ),
 (14,11.175,'2026-04-25 19:28',205,8   ,'PARCEL'  ),
 (15, 6.215,'2026-04-25 22:00', 55,7   ,NULL      ),
 (16, 4.625,'2026-04-26 01:05', 70,14  ,NULL      ),
 (17, 9.440,'2026-04-27 03:00',130,NULL,'HOLLOW'  ),
 (18, 6.215,'2026-04-29 22:04',640,7   ,'TRIPLE-3');

INSERT INTO audit_log VALUES
 (1 ,'suspects'    , 3,'UPDATE','m.thorne','2026-05-30 23:58','risk_score=78'                ,'risk_score=12'),
 (2 ,'suspects'    , 3,'UPDATE','m.thorne','2026-05-31 00:03','has_alibi=0'                  ,'has_alibi=1'),
 (3 ,'evidence'    ,24,'DELETE','m.thorne','2026-05-31 00:19','item=Shredded index card'     ,NULL),
 (4 ,'suspects'    , 1,'UPDATE','m.thorne','2026-05-31 00:25','district=Civic Hill'          ,'district=Riverside'),
 (5 ,'witnesses'   , 9,'UPDATE','m.thorne','2026-05-31 00:40','credibility=91'               ,'credibility=22'),
 (6 ,'calls'       ,24,'DELETE','m.thorne','2026-05-31 01:02','caller_id=3,receiver_id=10'   ,NULL),
 (7 ,'transactions',21,'DELETE','m.thorne','2026-05-31 01:15','amount=12000.0'               ,NULL),
 (8 ,'suspects'    ,10,'UPDATE','j.reed'  ,'2026-04-26 11:00','notes=NULL'                   ,'notes=Interviewed'),
 (9 ,'evidence'    ,18,'INSERT','m.sol'   ,'2026-04-25 15:20',NULL                           ,'item=Payment envelope'),
 (10,'cases'       , 4,'UPDATE','j.reed'  ,'2026-04-30 09:00','status=open'                  ,'status=open'),
 (11,'suspects'    , 6,'UPDATE','m.sol'   ,'2026-03-12 10:00','risk_score=55'                ,'risk_score=81'),
 (12,'suspects'    , 3,'UPDATE','m.thorne','2026-05-31 02:35','notes=NULL'                   ,'notes=Bureau employee - above suspicion'),
 (13,'keycard_logs',12,'DELETE','m.thorne','2026-05-31 02:38','swipe_time=2026-05-30 23:12'  ,NULL),
 (14,'employees'   , 6,'UPDATE','m.thorne','2026-05-20 14:00','salary=52000'                 ,'salary=69000'),
 (15,'witnesses'   ,16,'INSERT','m.thorne','2026-05-31 03:05',NULL                           ,'name=Felix Marsh');

INSERT INTO scratch_pad VALUES
 (1,'coffee order - black, two sugars'),
 (2,'remember to reset the terminal clock'),
 (3,'do not file this');
`;

/* Column catalogue used by the Schema Explorer panel. */
export const TABLE_DOCS = {
  suspects:     'Everyone the Bureau has ever looked at twice.',
  locations:    'Buildings in Ashvale, with their security rating.',
  cases:        'Open, closed and cold case files.',
  evidence:     'Items logged into the evidence locker.',
  witnesses:    'Statements taken, with a credibility rating out of 100.',
  calls:        'Telephone records: who called whom, when, for how long.',
  transactions: 'Money moving between hands.',
  keycard_logs: 'Door swipes in and out of secure buildings.',
  employees:    'Staff rosters. Note the manager_id column.',
  vehicles:     'Registered plates and their owners.',
  couriers:     'Licensed delivery firms.',
  shipments:    'Parcels moved across the city.',
  radio_logs:   'Shortwave broadcasts picked up by the listening post.',
  audit_log:    'Tamper-evident journal of every change to the database.',
  scratch_pad:  'Somebody left their notes in the database. Again.'
};
