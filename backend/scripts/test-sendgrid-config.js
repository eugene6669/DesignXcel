require('dotenv').config();

console.log('🔍 Testing SendGrid Configuration...\n');

// Check environment variables
console.log('📋 Environment Variables:');
console.log('  SENDGRID_API_KEY exists:', !!process.env.SENDGRID_API_KEY);
console.log('  SENDGRID_API_KEY length:', process.env.SENDGRID_API_KEY ? process.env.SENDGRID_API_KEY.length : 0);
console.log('  SENDGRID_API_KEY starts with SG.:', process.env.SENDGRID_API_KEY ? process.env.SENDGRID_API_KEY.startsWith('SG.') : false);
console.log('  OTP_EMAIL_USER:', process.env.OTP_EMAIL_USER);
console.log('  SENDGRID_FROM_EMAIL:', process.env.SENDGRID_FROM_EMAIL || 'Not set');
console.log('\n');

// Test SendGrid initialization
try {
    const sgMail = require('@sendgrid/mail');
    const apiKey = process.env.SENDGRID_API_KEY;
    
    if (!apiKey) {
        console.error('❌ SENDGRID_API_KEY not found in environment variables');
        process.exit(1);
    }
    
    sgMail.setApiKey(apiKey);
    console.log('✅ SendGrid initialized successfully\n');
    
    // Test sending a simple email
    const testEmail = process.argv[2] || process.env.TEST_EMAIL || 'design.xcel01@gmail.com';
    const fromEmail = process.env.OTP_EMAIL_USER || process.env.SENDGRID_FROM_EMAIL || 'design.xcel01@gmail.com';
    
    console.log('📧 Test Email Configuration:');
    console.log('  From:', fromEmail);
    console.log('  To:', testEmail);
    console.log('\n');
    
    const msg = {
        to: testEmail,
        from: {
            email: fromEmail,
            name: 'Design Excellence'
        },
        subject: 'SendGrid Configuration Test',
        text: 'This is a test email to verify SendGrid configuration.',
        html: '<p>This is a test email to verify SendGrid configuration.</p>'
    };
    
    console.log('📤 Sending test email...');
    sgMail.send(msg)
        .then((response) => {
            console.log('✅ Test email sent successfully!');
            console.log('  Status Code:', response[0].statusCode);
            console.log('  Message ID:', response[0].headers['x-message-id']);
            console.log('\n💡 Check your inbox (and spam folder) for the test email.');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Failed to send test email:');
            console.error('  Error:', error.message);
            if (error.response) {
                console.error('  Status Code:', error.response.statusCode);
                console.error('  Response Body:', JSON.stringify(error.response.body, null, 2));
            }
            process.exit(1);
        });
        
} catch (error) {
    console.error('❌ Error testing SendGrid:', error.message);
    process.exit(1);
}

