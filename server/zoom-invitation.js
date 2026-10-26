async function sendZoomInvitation(transporter, job, joinUrl, env = process.env) {
  const link = new URL(joinUrl);
  if (link.protocol !== 'https:' || !(link.hostname === 'zoom.us' || link.hostname.endsWith('.zoom.us') || link.hostname === 'zoom.com' || link.hostname.endsWith('.zoom.com'))) {
    throw new Error('Invalid Zoom join URL');
  }
  const info = await transporter.sendMail({
    from: `"DOS Club Open Source Fridays" <${env.FROM_EMAIL || 'info@dosclub.com'}>`,
    to: job.email,
    replyTo: env.REPLY_TO_EMAIL || 'info@descienceosclub.com',
    subject: `Zoom Invitation: EP ${job.episode_number} - ${job.title}`,
    text: `Hi ${job.full_name},\n\nYour registration is confirmed for Episode ${job.episode_number}: ${job.title}.\n\nDate: ${new Date(job.event_date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'long', day: 'numeric' })}\nTime: ${job.event_time}\n\nJoin your Zoom meeting using your personal link:\n${link.href}\n\nKeep this link private.\n\nOpen Source Friday Team`,
  });
  if (!info.accepted?.some(address => String(address).toLowerCase() === job.email.toLowerCase())) {
    throw new Error('Email service did not accept the invitation recipient');
  }
  return info.messageId;
}
module.exports = { sendZoomInvitation };
