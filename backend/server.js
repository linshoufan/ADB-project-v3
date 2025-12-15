const express = require('express');
const neo4j = require('neo4j-driver');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 1. 定義寫死的地址與經緯度對照表
// ==========================================
const LOCATION_DB = {
    '臺中市中區綠川西街73號': { lat: 24.138260, lng: 120.684192 },
    '臺中市西區公益路68號': { lat: 24.151943, lng: 120.664182 },
    '臺中市南屯區文心南三路289號': { lat: 24.132826, lng: 120.649256 },
    '臺中市南屯區向上路二段168號4樓': { lat: 24.148559, lng: 120.646890 },
    '臺中市南屯區文心南路511號': { lat: 24.124327, lng: 120.648994 },
    '臺中市西屯區中清路二段189巷57號': { lat: 24.177206, lng: 120.668013 },
    '臺中市北區崇德路一段55號': { lat: 24.157793, lng: 120.685618 },
    '臺中市北區忠明路499號': { lat: 24.163232, lng: 120.672338 },
    '臺中市西屯區惠來路二段101號': { lat: 24.163199, lng: 120.641905 },
    '臺中市南屯區黎明路二段503號': { lat: 24.155306, lng: 120.634099 }
};

// ---------------------------------------------------------
// 1. 設定資料庫連線
// ---------------------------------------------------------
const driver = neo4j.driver(
  'neo4j://localhost:7687',
  neo4j.auth.basic('neo4j', 'HealthcareDBpw') 
);

// ---------------------------------------------------------
// 2. 定義 API
// ---------------------------------------------------------

app.get('/', (req, res) => {
  res.send('後端伺服器運作中');
});

// 取得所有醫生列表
app.get('/api/doctors', async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run('MATCH (d:Doctor) RETURN d');
    const doctors = result.records.map(record => record.get('d').properties);
    res.json(doctors);
  } catch (error) {
    res.status(500).send(error.message);
  } finally {
    await session.close();
  }
});

// 取得所有病人列表
app.get('/api/patients', async (req, res) => {
    const session = driver.session();
    try {
      const result = await session.run('MATCH (p:Patient) RETURN p');
      const patients = result.records.map(record => record.get('p').properties);
      res.json(patients);
    } catch (error) {
      res.status(500).send(error.message);
    } finally {
      await session.close();
    }
});

// 新增醫生
app.post('/api/doctors', async (req, res) => {
    const { name, id, subject } = req.body;
    const session = driver.session();
    try {
        await session.run(
            `CREATE (d:Doctor {name: $name, id: $id, subject: $subject}) RETURN d`,
            { name, id, subject: subject || "" }
        );
        res.json({ message: `醫生 ${name} 新增成功` });
    } catch (error) {
        res.status(500).send(error.message);
    } finally {
        await session.close();
    }
});

// 修改醫生資料
app.put('/api/doctors/:targetId', async (req, res) => {
    const targetId = req.params.targetId;
    const { name, id, subject } = req.body;
    const session = driver.session();
    try {
        const query = `
            MATCH (d:Doctor {id: $targetId})
            SET d.name = $name, d.id = $id, d.subject = $subject
            RETURN d
        `;
        await session.run(query, { targetId, name, id, subject: subject || "" });
        res.json({ message: `醫生資料已更新` });
    } catch (error) {
        res.status(500).send(error.message);
    } finally {
        await session.close();
    }
});

// 刪除醫生
app.delete('/api/doctors/:targetId', async (req, res) => {
    const targetId = req.params.targetId;
    const session = driver.session();
    try {
        const query = `MATCH (d:Doctor {id: $targetId}) DETACH DELETE d`;
        await session.run(query, { targetId });
        res.json({ message: `醫生 (ID: ${targetId}) 已刪除` });
    } catch (error) {
        res.status(500).send(error.message);
    } finally {
        await session.close();
    }
});

// 尋找替代醫生
app.get('/api/appointments/:appointmentId/alternatives', async (req, res) => {
    const { appointmentId } = req.params;
    const session = driver.session();

    try {
        const query = `
            MATCH (p:Patient)-[r1:HAS_APPOINTMENT]->(a:Appointment {id: $appointmentId})-[r2:ASSIGNED_TO]->(badDoc:Doctor)
            MATCH (altDoc:Doctor)
            WHERE altDoc.id <> badDoc.id
            OPTIONAL MATCH (p)-[rHistory:TREATED_BY]->(altDoc)
            WITH p, a, badDoc, altDoc, rHistory,
                    (CASE WHEN rHistory IS NOT NULL THEN 5 ELSE 0 END) AS score
            ORDER BY score DESC
            LIMIT 5
            RETURN p, a, badDoc, altDoc, score, rHistory
        `;
        
        const result = await session.run(query, { appointmentId });
        
        let nodes = [];
        let links = [];
        const addedNodeIds = new Set();
        
        const addNode = (node, group, labelKey = 'name') => {
            if (!node) return null;
            if (!addedNodeIds.has(node.elementId)) {
                nodes.push({ 
                    id: node.elementId, 
                    label: node.properties[labelKey] || node.properties.id, 
                    group: group, 
                    ...node.properties 
                });
                addedNodeIds.add(node.elementId);
            }
            return node.elementId;
        };

        let original = null;
        let alternativesList = [];

        result.records.forEach(record => {
            const pId = addNode(record.get('p'), 'Patient');
            const aId = addNode(record.get('a'), 'Appointment', 'time');
            const badId = addNode(record.get('badDoc'), 'Doctor'); 
            const altId = addNode(record.get('altDoc'), 'Doctor');

            links.push({ source: pId, target: aId, label: 'HAS_APPOINTMENT' });
            links.push({ source: aId, target: badId, label: 'ORIGINAL' });
            
            if (record.get('rHistory')) {
                links.push({ source: pId, target: altId, label: 'TREATED_BY', color: '#FFD700', value: 2 });
            } else {
                links.push({ source: aId, target: altId, label: 'SUGGESTED', lineDash: [5, 5] });
            }

            original = record.get('badDoc').properties;
            alternativesList.push({
                ...record.get('altDoc').properties,
                score: record.get('score').low
            });
        });

        const uniqueLinks = [...new Set(links.map(JSON.stringify))].map(JSON.parse);
        
        res.json({ 
            graph: { nodes, links: uniqueLinks },
            info: { original_doctor: original, alternatives: alternativesList }
        });

    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    } finally {
        await session.close();
    }
});

// 建立新預約
app.post('/api/appointments', async (req, res) => {
    const { patientId, doctorId, time, duration } = req.body;
    const session = driver.session();
    const appointId = `APP${Date.now()}`; 

    try {
        const query = `
            MATCH (p:Patient {id: $patientId})
            MATCH (d:Doctor {id: $doctorId})
            CREATE (a:Appointment {
                id: $appointId,
                time: $time,
                duration: $duration,
                status: 'Pending'
            })
            CREATE (p)-[:HAS_APPOINTMENT]->(a)
            CREATE (a)-[:ASSIGNED_TO]->(d)
            RETURN a
        `;
        
        await session.run(query, { 
            patientId, 
            doctorId, 
            time, 
            appointId, 
            duration: parseInt(duration) || 30 
        });
        
        res.json({ message: `預約建立成功 單號: ${appointId}` });
    } catch (error) {
        console.error("建立預約失敗:", error);
        res.status(500).send("建立失敗: " + error.message);
    } finally {
        await session.close();
    }
});

// OSRM Helper
const getTravelTimeOSRM = async (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const url = `http://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            return Math.ceil(data.routes[0].duration / 60);
        }
        return 999;
    } catch (error) {
        console.error("OSRM Error:", error.message);
        return 30;
    }
};

// 智慧推薦醫生
app.post('/api/find-available-doctors', async (req, res) => {
    const { patientId, newTime, newDuration } = req.body;
    const session = driver.session();

    try {
        const pResult = await session.run(`MATCH (p:Patient {id: $patientId}) RETURN p`, { patientId });
        if (pResult.records.length === 0) return res.status(404).json({ message: "病人不存在" });
        const targetP = pResult.records[0].get('p').properties;
        
        const toMins = (t) => {
            if(!t || !t.includes(':')) return 0;
            const parts = t.split(' ')[1] ? t.split(' ')[1].split(':') : t.split(':');
            return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        };
        const newStart = toMins(newTime);
        const newEnd = newStart + parseInt(newDuration || 30);

        const docResult = await session.run(`
            MATCH (d:Doctor)
            OPTIONAL MATCH (d)<-[:ASSIGNED_TO]-(a:Appointment)<-[:HAS_APPOINTMENT]-(p:Patient)
            WITH d, a, p ORDER BY a.time ASC
            WITH d, collect({time: a.time, duration: a.duration, lat: p.lat, lng: p.lng}) as schedule
            RETURN d.id as id, d.name as name, d.subject as subject, schedule
        `);

        const availableDoctors = [];
        for (const record of docResult.records) {
            const docId = record.get('id');
            const docName = record.get('name');
            const schedule = record.get('schedule').filter(s => s.time !== null);
            
            let isFeasible = true;
            let travelTimeFromPrev = 0;

            for (let i = 0; i <= schedule.length; i++) {
                const prevAppt = i > 0 ? schedule[i - 1] : null;
                const nextAppt = i < schedule.length ? schedule[i] : null;
                const prevEnd = prevAppt ? toMins(prevAppt.time) + parseInt(prevAppt.duration || 30) : -Infinity;
                const nextStart = nextAppt ? toMins(nextAppt.time) : Infinity;

                if (newStart >= prevEnd && newEnd <= nextStart) {
                    let timeFromPrev = 0;
                    let timeToNext = 0;
                    if (prevAppt) {
                        timeFromPrev = await getTravelTimeOSRM(prevAppt.lat, prevAppt.lng, targetP.lat, targetP.lng);
                    }
                    if (nextAppt) {
                        timeToNext = await getTravelTimeOSRM(targetP.lat, targetP.lng, nextAppt.lat, nextAppt.lng);
                    }
                    const condition1 = (prevEnd + timeFromPrev) <= newStart;
                    const condition2 = (newEnd + timeToNext) <= nextStart;

                    if (condition1 && condition2) {
                        availableDoctors.push({ id: docId, name: docName, travelTime: timeFromPrev });
                        break;
                    }
                }
            }
        }
        availableDoctors.sort((a, b) => a.travelTime - b.travelTime);
        res.json(availableDoctors);
    } catch (error) {
        console.error("Recommendation Error:", error);
        res.status(500).send(error.message);
    } finally {
        await session.close();
    }
});

// 取得所有預約
app.get('/api/appointments', async (req, res) => {
    const session = driver.session();
    const { date, doctorId } = req.query;

    try {
        let query = `
            MATCH (a:Appointment)
            OPTIONAL MATCH (p:Patient)-[:HAS_APPOINTMENT]->(a)
            OPTIONAL MATCH (a)-[:ASSIGNED_TO]->(d:Doctor)
            WHERE 1=1
        `;
        const params = {};
        if (date) { query += ` AND a.time STARTS WITH $date`; params.date = date; }
        if (doctorId) { query += ` AND d.id = $doctorId`; params.doctorId = doctorId; }
        
        // p.location 改為 p.address
        query += ` RETURN a, p, d, p.address as address ORDER BY a.time ASC`;

        const result = await session.run(query, params);
        const appointments = result.records.map(record => {
            const a = record.get('a').properties;
            const p = record.get('p') ? record.get('p').properties : { name: "Unknown", id_card_number: "" };
            const d = record.get('d') ? record.get('d').properties : { name: "Unassigned", id: "", subject: "-" };
            
            return { 
                id: a.id, 
                time: a.time, 
                status: a.status,
                priority: a.priority ? a.priority.low || a.priority : 99, 
                patientName: p.name,
                doctorName: d.name,
                doctorId: d.id,
                subject: d.subject, 
                // 回傳前端需要的欄位
                patientId: p.id_card_number || p.id, // 相容
                address: record.get('address') || "無地址", // 原 location
                symptoms: a.symptoms || "無症狀"
            };
        });
        res.json(appointments);
    } catch (error) {
        console.error("讀取預約失敗:", error);
        res.status(500).send(error.message);
    } finally {
        await session.close();
    }
});

// 刪除預約
app.delete('/api/appointments/:appointId', async (req, res) => {
    const { appointId } = req.params;
    const session = driver.session();
    try {
        await session.run(`MATCH (a:Appointment {id: $appointId}) DETACH DELETE a`, { appointId });
        res.json({ message: `預約 ${appointId} 已刪除` });
    } catch (error) {
        res.status(500).send(error.message);
    } finally {
        await session.close();
    }
});

// 取得路徑 (包含詳細病人資訊)
app.get('/api/route/:doctorId', async (req, res) => {
    const { doctorId } = req.params;
    const { date } = req.query;
    const session = driver.session();
    try {
        let query = `
            MATCH (d:Doctor {id: $doctorId})
            OPTIONAL MATCH (d)<-[:ASSIGNED_TO]-(a:Appointment)<-[:HAS_APPOINTMENT]-(p:Patient)
            WHERE p.lat IS NOT NULL AND p.lng IS NOT NULL
        `;

        // 如果前端有傳 date，就加上篩選
        if (date) {
            query += ` AND a.time STARTS WITH $date `;
        }

        query += `
            RETURN p.name as patient, 
                   p.id_card_number as patientId, 
                   p.lat as lat, p.lng as lng, a.time as time,
                   a.symptoms as symptoms, 
                   p.blood_type as blood_type, 
                   p.RH_type as RH_type,  
                   p.age as age, 
                   p.gender as gender,
                   p.phone as phone
            ORDER BY a.time ASC
        `;

        // 3. 執行查詢時傳入參數
        const result = await session.run(query, { doctorId, date });
        
        let route = [];

        result.records.forEach(record => {
            if (record.get('lat') && record.get('lng')) {
                route.push({
                    type: 'Patient',
                    name: record.get('patient'),
                    patientId: record.get('patientId'), 
                    lat: record.get('lat'),
                    lng: record.get('lng'),
                    time: record.get('time'),
                    symptoms: record.get('symptoms'),    
                    blood_type: record.get('blood_type'),
                    RH_type: record.get('RH_type'),        
                    age: record.get('age') ? record.get('age').low || record.get('age') : '', 
                    gender: record.get('gender'),
                    phone: record.get('phone')
                });
            }
        });
        
        res.json(route);
    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    } finally {
        await session.close();
    }
});

let clients = [];

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.flushHeaders();

  const clientId = Date.now();
  clients.push({ id: clientId, res });

  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 30000);

  req.on("close", () => {
    clearInterval(keepAlive);
    clients = clients.filter((c) => c.id !== clientId);
  });
});


function sendNewAppointmentEvent() {
  clients.forEach((client) => {
    console.log("sending notification");
    client.res.write(`event: new-appointment\ndata: {}\n\n`);
  });
}

// 建立預約請求
app.post("/api/appointment-requests", async (req, res) => {
  const session = driver.session();
  try {
    const { 
      id_card_number, name, date, timeSlot, subject, symptoms,
      age, gender, blood_type, RH_type, address, phone 
    } = req.body || {};

    if (!id_card_number || !name || !date || !timeSlot || !subject) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    const { lat, lng } = await geocodeAddress(address);
    console.log(`Geocoded ${address} -> lat: ${lat}, lng: ${lng}`);

    const normalizedId = String(id_card_number).trim().toUpperCase();
    const requestId = `REQ${Date.now()}`;

    const query = `
      MERGE (p:Patient {id_card_number: $id_card_number})
      ON CREATE SET 
        p.name = $name, 
        p.age = $age, 
        p.gender = $gender, 
        p.blood_type = $blood_type, 
        p.RH_type = $RH_type,
        p.address = $address, 
        p.phone = $phone, 
        p.lat = $lat, 
        p.lng = $lng,
        p.createdAt = datetime()
      ON MATCH SET
        p.name = $name, 
        p.age = $age, 
        p.gender = $gender,
        p.blood_type = $blood_type, 
        p.RH_type = $RH_type,
        p.address = $address, 
        p.phone = $phone, 
        p.lat = $lat, 
        p.lng = $lng

      CREATE (r:AppointmentRequest {
        id: $requestId, date: $date, timeSlot: $timeSlot, subject: $subject,
        symptoms: $symptoms, status: 'PENDING', createdAt: datetime()
      })
      CREATE (p)-[:REQUESTED_APPOINTMENT]->(r)
      RETURN r
    `;

    await session.run(query, {
      id_card_number: normalizedId, 
      name: String(name),
      age: age ? parseInt(age) : null,
      gender: String(gender || ""),
      blood_type: String(blood_type || ""), 
      RH_type: String(RH_type || ""),
      address: String(address || ""), 
      phone: String(phone || ""),
      requestId: requestId, 
      date: String(date), 
      timeSlot: String(timeSlot),
      subject: String(subject), 
      symptoms: String(symptoms || ""),
      lat: lat, lng: lng
    });

    sendNewAppointmentEvent()
    res.json({ message: "Success", id: requestId });
  } catch (error) {
    console.error("建立預約請求失敗:", error);
    res.status(500).json({ message: error.message });
  } finally {
    await session.close();
  }
});

// 取得預約請求
app.get("/api/appointment-requests", async (req, res) => {
  const session = driver.session();
  try {
    const status = req.query.status ? String(req.query.status).trim().toUpperCase() : "";
    const subject = req.query.subject ? String(req.query.subject).trim() : "";

    const query = `
      MATCH (p:Patient)-[:REQUESTED_APPOINTMENT]->(r:AppointmentRequest)
      WHERE 1=1
      ${status ? "AND r.status = $status" : ""}
      ${subject ? "AND r.subject = $subject" : ""}
      RETURN r, p
      ORDER BY r.createdAt DESC
    `;

    const result = await session.run(query, {
      status: status || undefined,
      subject: subject || undefined
    });

    const rows = result.records.map((rec) => {
      const r = rec.get("r").properties;
      const p = rec.get("p").properties;
      return {
        id: r.id, status: r.status, date: r.date, timeSlot: r.timeSlot, scheduledAt: r.date + " " + r.timeSlot, 
        subject: r.subject, symptoms: r.symptoms, createdAt: r.createdAt,
        // 更新回傳物件的 key
        id_card_number: p.id_card_number || p.id, // 相容舊資料
        name: p.name, 
        address: p.address || p.location, // 相容舊資料
        age: p.age, 
        gender: p.gender,
        blood_type: p.blood_type, 
        RH_type: p.RH_type || p.rhesus, 
        phone: p.phone || p.contact
      };
    });
    return res.json(rows);
  } catch (error) {
    console.error("Query appointment requests failed:", error);
    return res.status(500).send(error.message);
  } finally {
    await session.close();
  }
});

app.delete("/api/appointment-requests/:requestId", async (req, res) => {
  const session = driver.session();
  try {
    const requestId = String(req.params.requestId || "").trim();
    if (!requestId) return res.status(400).json({ message: "Missing requestId" });
    await session.run(`MATCH (r:AppointmentRequest {id: $requestId}) DETACH DELETE r`, { requestId });
    return res.json({ message: `Appointment request ${requestId} deleted` });
  } catch (error) {
    console.error("Delete appointment request failed:", error);
    return res.status(500).send(error.message);
  } finally {
    await session.close();
  }
});

// 修改預約
app.put('/api/appointments/:appointId', async (req, res) => {
    const { appointId } = req.params;
    const { patientId, doctorId, time } = req.body;
    const session = driver.session();
    try {
        const query = `
            MATCH (a:Appointment {id: $appointId})
            OPTIONAL MATCH (a)-[r1:ASSIGNED_TO]->()
            OPTIONAL MATCH ()-[r2:HAS_APPOINTMENT]->(a)
            DELETE r1, r2
            SET a.time = $time
            WITH a
            MATCH (p:Patient {id: $patientId})
            MATCH (d:Doctor {id: $doctorId})
            CREATE (p)-[:HAS_APPOINTMENT]->(a)
            CREATE (a)-[:ASSIGNED_TO]->(d)
            RETURN a
        `;
        await session.run(query, { appointId, patientId, doctorId, time });
        res.json({ message: `預約 ${appointId} 更新成功` });
    } catch (error) {
        console.error("更新預約失敗:", error);
        res.status(500).send(error.message);
    } finally {
        await session.close();
    }
});

// 衝突檢測
app.post('/api/check-availability', async (req, res) => {
    const { doctorId, patientId, newTime, newDuration } = req.body;
    const session = driver.session();
    try {
        const docCheck = await session.run(`MATCH (d:Doctor {id: $doctorId}) RETURN d`, { doctorId });
        if (docCheck.records.length === 0) return res.json({ available: false, reason: "醫生不存在" });
        
        const querySchedule = `
            MATCH (d:Doctor {id: $doctorId})<-[:ASSIGNED_TO]-(a:Appointment)<-[:HAS_APPOINTMENT]-(p:Patient)
            RETURN a.time as time, a.duration as duration, p.lat as lat, p.lng as lng
        `;
        const resultSchedule = await session.run(querySchedule, { doctorId });
        const appointments = resultSchedule.records.map(r => ({
            time: r.get('time'), duration: r.get('duration') || 30, lat: r.get('lat'), lng: r.get('lng')
        }));

        const queryTarget = `MATCH (p:Patient {id: $patientId}) RETURN p.lat as lat, p.lng as lng`;
        const resultTarget = await session.run(queryTarget, { patientId });
        if (resultTarget.records.length === 0) return res.json({ available: false, reason: "找不到該病人 ID" });
        const targetP = resultTarget.records[0];
        const targetLat = targetP.get('lat');
        const targetLng = targetP.get('lng');

        const toMins = (t) => {
            if(!t || !t.includes(':')) return 0;
            const parts = t.split(' ')[1] ? t.split(' ')[1].split(':') : t.split(':');
            return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        };
        const newStart = toMins(newTime);
        const newEnd = newStart + parseInt(newDuration || 30);
        
        const getDistKm = (lat1, lng1, lat2, lng2) => {
            if(!lat1 || !lat2) return 0;
            const R = 6371; 
            const dLat = (lat2-lat1) * Math.PI/180;
            const dLon = (lng2-lng1) * Math.PI/180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c;
        };

        let conflict = false;
        let conflictReason = "";

        for (const appt of appointments) {
            const existStart = toMins(appt.time);
            const existEnd = existStart + parseInt(appt.duration);
            const dist = getDistKm(targetLat, targetLng, appt.lat, appt.lng);
            const travelTime = Math.ceil(dist / 0.67); 
            const safeStart = existStart - travelTime; 
            const safeEnd = existEnd + travelTime;     
            
            if (newStart < safeEnd && newEnd > safeStart) {
                conflict = true;
                conflictReason = `時間衝突 需預留 ${travelTime} 分鐘車程`;
                break;
            }
        }
        res.json({ available: !conflict, reason: conflictReason });

    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    } finally {
        await session.close();
    }
});

// 視覺化鏈
app.get('/api/doctor-chain/:doctorId', async (req, res) => {
    const { doctorId } = req.params;
    const session = driver.session();
    try {
        const query = `
            MATCH (d:Doctor {id: $doctorId})<-[:ASSIGNED_TO]-(a:Appointment)<-[:HAS_APPOINTMENT]-(p:Patient)
            WITH d, a, p ORDER BY a.time ASC
            RETURN d, collect({appt: a, patient: p}) AS schedule
        `;
        const result = await session.run(query, { doctorId });
        
        let nodes = [];
        let links = [];
        
        if(result.records.length > 0) {
            const rec = result.records[0];
            const d = rec.get('d');
            const schedule = rec.get('schedule');
            
            nodes.push({ id: d.elementId, label: d.properties.name, group: 'Doctor' });
            
            let prevNodeId = d.elementId;
            
            schedule.forEach((item, index) => {
                const appt = item.appt.properties;
                const p = item.patient;
                const pNodeId = p.elementId;
                if (!nodes.find(n => n.id === pNodeId)) {
                    nodes.push({ id: pNodeId, label: `${p.properties.name} (${appt.time})`, group: 'Patient' });
                }
                links.push({ source: prevNodeId, target: pNodeId, label: index === 0 ? 'START' : 'NEXT', val: 5 });
                prevNodeId = pNodeId;
            });
        }
        res.json({ nodes, links });
    } catch (e) {
        console.error(e);
        res.status(500).send(e.message);
    } finally {
        await session.close();
    }
});

// 單一病人
app.get('/api/patients/:id', async (req, res) => {
    const { id } = req.params;
    const session = driver.session();
    try {
        const result = await session.run(`MATCH (p:Patient {id: $id}) RETURN p`, { id: id.toUpperCase() });
        if (result.records.length > 0) {
            const p = result.records[0].get('p').properties;
            res.json(p);
        } else {
            res.status(404).json({ message: "Patient not found" });
        }
    } catch (error) {
        res.status(500).send(error.message);
    } finally {
        await session.close();
    }
});

// Confirm
app.post("/api/appointments/confirm", async (req, res) => {
  const session = driver.session();
  const { requestId, doctorId, priority, timeSlot, date } = req.body;
  const appointId = `APP${Date.now()}`; 

  try {
    const query = `
      MATCH (r:AppointmentRequest {id: $requestId})
      MATCH (p:Patient)-[:REQUESTED_APPOINTMENT]->(r)
      MATCH (d:Doctor {id: $doctorId})
      CREATE (a:Appointment {
        id: $appointId, time: $date + ' ' + $timeSlot, duration: 30,
        status: 'Booked', priority: $priority, symptoms: r.symptoms
      })
      CREATE (p)-[:HAS_APPOINTMENT]->(a)
      CREATE (a)-[:ASSIGNED_TO]->(d)
      DETACH DELETE r
      RETURN a, p, d
    `;
    await session.run(query, { requestId, doctorId, priority: parseInt(priority) || 3, date, timeSlot, appointId });
    res.json({ message: "Appointment confirmed and request deleted", appointmentId: appointId });
  } catch (error) {
    console.error("Confirm appointment failed:", error);
    res.status(500).send(error.message);
  } finally {
    await session.close();
  }
});

app.post('/api/appointments/batch-update', async (req, res) => {
    const session = driver.session();
    const { updates } = req.body;
    try {
        const query = `
            UNWIND $updates AS u
            MATCH (a:Appointment {id: u.id})
            SET a.priority = u.priority, a.time = u.date + ' ' + u.timeSlot
            RETURN count(a) as updatedCount
        `;
        await session.run(query, { updates });
        res.json({ message: "Schedule updated successfully" });
    } catch (error) {
        console.error("Batch update failed:", error);
        res.status(500).send(error.message);
    } finally {
        await session.close();
    }
});

// geocodeAddress
const geocodeAddress = async (address) => {
    if (!address) return { lat: null, lng: null };
    if (LOCATION_DB[address]) {
        console.log(`[GeoCode] Using Hardcoded coordinates for: ${address}`);
        return LOCATION_DB[address];
    }
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'MediCare-App' } });
        const data = await res.json();
        if (data && data.length > 0) {
            return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }
    } catch (e) {
        console.error(`[GeoCode Error] "${address}":`, e.message);
    }
    return { lat: null, lng: null };
};

// getTravelTime
const getTravelTime = async (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 15; 
    const url = `http://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            return Math.ceil(data.routes[0].duration / 60);
        }
    } catch (e) {
        console.error("[OSRM Error]:", e.message);
    }
    return 15; 
};

// 智慧路徑排序 (嚴格遵守 AM/PM)
app.post('/api/optimize-schedule', async (req, res) => {
    const { date, doctorId, subject } = req.body;
    console.log(`[Optimize] Start for Doctor: ${doctorId}, Date: ${date}, Subject: ${subject}`);
    const session = driver.session();
    const HOSPITAL_LOC = { lat: 24.12954082292789, lng: 120.68203882648923 };

    try {
        const query = `
            MATCH (p:Patient)-[:REQUESTED_APPOINTMENT]->(r:AppointmentRequest)
            WHERE r.status = 'PENDING' AND r.subject = $subject
            RETURN r.id as id, 'REQUEST' as type, p.lat as lat, p.lng as lng, p.name as name, 
                   r.timeSlot as originalSlot, null as time, r.symptoms as symptoms, 
                   p.id_card_number as patientId, p.address as address // 修改這裡

            UNION
            
            MATCH (p:Patient)-[:HAS_APPOINTMENT]->(a:Appointment)-[:ASSIGNED_TO]->(d:Doctor {id: $doctorId})
            WHERE a.time STARTS WITH $date
            RETURN a.id as id, 'APPOINTMENT' as type, p.lat as lat, p.lng as lng, p.name as name, 
                   null as originalSlot, a.time as time, a.symptoms as symptoms,
                   p.id_card_number as patientId, p.address as address // 修改這裡
        `;

        const result = await session.run(query, { date, doctorId, subject });
        
        // 2. 預處理：解析 Existing Appointment 的時段 (AM/PM)
        let pool = result.records.map(rec => {
            const type = rec.get('type');
            let originalSlot = rec.get('originalSlot'); // Request 本來就有 slot
            const rawTime = rec.get('time');

            // 如果是已存在的 Appointment，根據時間判斷它是 AM 還是 PM
            if (type === 'APPOINTMENT' && rawTime) {
                // 格式可能是 "2025-12-14 09:30"
                if (rawTime.includes(' ')) {
                    const timePart = rawTime.split(' ')[1]; // "09:30"
                    const hour = parseInt(timePart.split(':')[0], 10);
                    originalSlot = hour < 12 ? 'AM' : 'PM';
                } else {
                    originalSlot = 'AM'; // Fallback
                }
            }

            return {
                id: rec.get('id'), type: type, lat: rec.get('lat'), lng: rec.get('lng'),
                name: rec.get('name'), symptoms: rec.get('symptoms'), patientId: rec.get('patientId'),
                address: rec.get('address'), originalSlot: originalSlot
            };
        });

        if (pool.length === 0) return res.json({ AM: [], PM: [] });

        // 補經緯度
        for (let item of pool) {
            if (!item.lat || !item.lng) {
                const coords = await geocodeAddress(item.address);
                item.lat = coords.lat || HOSPITAL_LOC.lat; 
                item.lng = coords.lng || HOSPITAL_LOC.lng;
            }
        }

        const AM_START = 540;   // 09:00
        const PM_START = 780;   // 13:00
        const LUNCH_BREAK = 720; // 12:00
        const VISIT_DURATION = 30; 
        
        let scheduleAM = []; 
        let schedulePM = [];
        let currentLoc = HOSPITAL_LOC; 
        let currentTime = AM_START; 
        let isPM = false; 

        const formatTime = (mins) => {
            let h = Math.floor(mins / 60); let m = mins % 60;
            return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        };

        // Greedy with AM/PM Constraint
        while (pool.length > 0) {
            // 決定目前要處理哪個時段的候選人
            const currentMode = isPM ? "PM" : "AM";
            
            // 篩選: 嚴格限制候選人必須符合當前時段 (無論是 Request 還是 Appointment)
            const validCandidates = pool.filter(item => {
                return item.originalSlot === currentMode;
            });

            // 如果目前時段沒人了
            if (validCandidates.length === 0) {
                if (!isPM) {
                    // AM 沒人了 -> 切換到 PM
                    isPM = true;
                    currentTime = Math.max(currentTime, PM_START);
                    continue; 
                } else {
                    // PM 也沒人了 (Pool 裡可能剩一些標記錯誤的，或完全無法排入的)
                    break;
                }
            }

            // 找最近鄰居
            let bestItem = null;
            let minTravelTime = Infinity;

            // 平行計算距離
            const travelTimes = await Promise.all(
                validCandidates.map(c => getTravelTime(currentLoc.lat, currentLoc.lng, c.lat, c.lng))
            );

            for (let i = 0; i < validCandidates.length; i++) {
                if (travelTimes[i] < minTravelTime) {
                    minTravelTime = travelTimes[i];
                    bestItem = validCandidates[i];
                }
            }

            if (!bestItem) break; 

            // 計算時間
            const arrivalTime = currentTime + minTravelTime;
            const finishTime = arrivalTime + VISIT_DURATION;

            // 檢查是否跨越午休
            if (!isPM && finishTime > LUNCH_BREAK) {
                // 如果 AM 時段排不下了，理論上這個 Item 不能排到 PM (因為有限制)
                // 所以這裡直接切換到 PM 模式，放棄這輪的 AM 嘗試
                // 下一輪迴圈會因為 isPM=true 而去抓 PM 的候選人
                // 注意：這意味著如果 AM 滿了，剩下的 AM 單就會被捨棄 (留在 pool 中)，不會硬塞到 PM
                isPM = true;
                currentTime = PM_START;
                continue;
            }

            // 確定排入
            const assignedSlot = isPM ? "PM" : "AM";
            const scheduledItem = {
                ...bestItem, 
                timeSlot: assignedSlot, 
                eta: formatTime(arrivalTime),
                travelMinutes: minTravelTime, 
                priority: (assignedSlot === "AM" ? scheduleAM.length : schedulePM.length) + 1
            };

            if (assignedSlot === "AM") scheduleAM.push(scheduledItem); 
            else schedulePM.push(scheduledItem);

            currentLoc = { lat: bestItem.lat, lng: bestItem.lng };
            currentTime = finishTime;

            // 從 pool 移除
            pool = pool.filter(p => p.id !== bestItem.id);
        }
        
        res.json({ AM: scheduleAM, PM: schedulePM });
    } catch (error) {
        console.error("[Optimize Failed]:", error);
        res.status(500).send(error.message);
    } finally {
        await session.close();
    }
});

// Recalculate timings
app.post('/api/recalculate-timings', async (req, res) => {
    const { items, startTime, date } = req.body; 
    const HOSPITAL_LOC = { lat: 24.12954082292789, lng: 120.68203882648923 };
    try {
        if (!items || !Array.isArray(items)) return res.json([]);
        
        const toMins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        const formatTime = (mins) => { let h = Math.floor(mins / 60); let m = mins % 60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; };

        let currentLoc = HOSPITAL_LOC; let currentTime = toMins(startTime || "09:00");
        const updatedItems = [];

        for (const item of items) {
            let lat = item.lat; let lng = item.lng;
            if (!lat || !lng) {
               const coords = await geocodeAddress(item.location);
               lat = coords.lat || HOSPITAL_LOC.lat; lng = coords.lng || HOSPITAL_LOC.lng;
            }
            const travelMinutes = await getTravelTime(currentLoc.lat, currentLoc.lng, lat, lng);
            const arrivalTime = currentTime + travelMinutes;
            
            updatedItems.push({
                ...item, lat, lng, travelMinutes, eta: formatTime(arrivalTime), timeSlot: formatTime(arrivalTime) 
            });
            currentTime = arrivalTime + parseInt(item.duration || 30);
            currentLoc = { lat, lng };
        }
        res.json(updatedItems);
    } catch (error) {
        console.error("Recalculate Error:", error);
        res.status(500).send(error.message);
    }
});

const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Backend Server running on: http://localhost:${PORT}`);
});