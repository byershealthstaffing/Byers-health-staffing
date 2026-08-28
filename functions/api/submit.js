const MAX_TOTAL_UPLOAD_BYTES = 3.5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png'
]);

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function values(form, key) {
  return form.getAll(key).map(v => typeof v === 'string' ? v : '').filter(Boolean).join(', ');
}

function textField(form, key) {
  const v = form.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

function row(label, value) {
  if (!value) return '';
  return `<tr><td style="padding:6px 10px;font-weight:700;vertical-align:top">${esc(label)}</td><td style="padding:6px 10px">${esc(value)}</td></tr>`;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function onRequestPost(context) {
  try {
    const form = await context.request.formData();

    const required = ['firstName','lastName','email','phone','certState','certNumber','certStatus','years','startDate','signature','signatureDate'];
    for (const key of required) {
      if (!textField(form, key)) {
        return Response.json({ error: `Missing required field: ${key}` }, { status: 400 });
      }
    }
    if (!form.get('certify')) {
      return Response.json({ error: 'Applicant certification is required.' }, { status: 400 });
    }

    const applicantEmail = textField(form, 'email');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicantEmail)) {
      return Response.json({ error: 'Invalid applicant email address.' }, { status: 400 });
    }

    const fileKeys = ['resume','cnaDoc','cprDoc','otherDoc'];
    const attachments = [];
    let totalBytes = 0;

    for (const key of fileKeys) {
      const file = form.get(key);
      if (file && typeof file !== 'string' && file.size > 0) {
        if (!ALLOWED_TYPES.has(file.type)) {
          return Response.json({ error: `Unsupported file type for ${file.name}.` }, { status: 400 });
        }
        totalBytes += file.size;
        if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
          return Response.json({ error: 'Uploaded documents are too large. Please keep all attachments under 3.5 MB total.' }, { status: 400 });
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        attachments.push({
          content: bytesToBase64(bytes),
          filename: file.name.replace(/[^a-zA-Z0-9._-]/g, '_'),
          type: file.type,
          disposition: 'attachment'
        });
      }
    }

    const firstName = textField(form, 'firstName');
    const lastName = textField(form, 'lastName');
    const fullName = `${firstName} ${lastName}`.trim();

    const fields = [
      ['Applicant', fullName], ['Email', applicantEmail], ['Phone', textField(form,'phone')],
      ['Address', [textField(form,'address'), textField(form,'city'), textField(form,'state'), textField(form,'zip')].filter(Boolean).join(', ')],
      ['Preferred Contact', textField(form,'contactMethod')], ['Certification State', textField(form,'certState')],
      ['CNA Registry Number', textField(form,'certNumber')], ['Certification Expiration', textField(form,'certExpiration')],
      ['Certification Status', textField(form,'certStatus')], ['CPR / BLS Certified', textField(form,'cpr')],
      ['CPR / BLS Expiration', textField(form,'cprExpiration')], ['Additional Certifications', textField(form,'additionalCerts')],
      ['Years of Experience', textField(form,'years')], ['Most Recent Employer', textField(form,'employer')],
      ['Job Title', textField(form,'jobTitle')], ['Dates Employed', textField(form,'datesEmployed')],
      ['Experience / Duties', textField(form,'experience')], ['Care Settings', values(form,'setting')],
      ['Earliest Start Date', textField(form,'startDate')], ['Employment Preference', textField(form,'employmentPreference')],
      ['Preferred Shifts', values(form,'shift')], ['Availability Notes', textField(form,'availabilityNotes')],
      ['Reference 1', [textField(form,'ref1Name'), textField(form,'ref1Contact')].filter(Boolean).join(' — ')],
      ['Reference 2', [textField(form,'ref2Name'), textField(form,'ref2Contact')].filter(Boolean).join(' — ')],
      ['Electronic Signature', textField(form,'signature')], ['Signature Date', textField(form,'signatureDate')]
    ];

    const html = `
      <div style="font-family:Arial,sans-serif;color:#1d2939">
        <h2>New CNA Application — Byers Health Staffing LLC</h2>
        <p>A new CNA application was submitted through byershealthstaffing.fyi/apply.</p>
        <table style="border-collapse:collapse;width:100%;max-width:760px">${fields.map(([l,v]) => row(l,v)).join('')}</table>
        <p style="margin-top:18px"><strong>Applicant certification:</strong> Agreed</p>
        <p>${attachments.length ? `${attachments.length} document(s) attached.` : 'No documents were attached.'}</p>
      </div>`;

    const text = fields.filter(([,v]) => v).map(([l,v]) => `${l}: ${v}`).join('\n');

    await context.env.EMAIL.send({
      to: context.env.APPLICATION_DESTINATION || 'Elizzb20@yahoo.com',
      from: context.env.APPLICATION_FROM || 'applications@byershealthstaffing.fyi',
      replyTo: applicantEmail,
      subject: `New CNA Application — ${fullName}`,
      html,
      text: `New CNA Application — Byers Health Staffing LLC\n\n${text}\n\nApplicant certification: Agreed`,
      attachments
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error('Application submission error', error);
    return Response.json({ error: 'Unable to submit application.' }, { status: 500 });
  }
}

