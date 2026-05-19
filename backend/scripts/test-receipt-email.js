require('dotenv').config();
const { sendOrderReceiptEmail } = require('../utils/sendgridHelper');

async function testReceiptEmail() {
    console.log('🧪 Testing Order Receipt Email Sending...\n');
    
    // Get email from command line argument or use default
    const testEmail = process.argv[2] || process.env.TEST_EMAIL || 'design.xcel01@gmail.com';
    
    console.log('📧 Test Email:', testEmail);
    console.log('📧 SENDGRID_API_KEY exists:', !!process.env.SENDGRID_API_KEY);
    console.log('📧 SENDGRID_API_KEY length:', process.env.SENDGRID_API_KEY ? process.env.SENDGRID_API_KEY.length : 0);
    console.log('📧 OTP_EMAIL_USER:', process.env.OTP_EMAIL_USER);
    console.log('\n');
    
    try {
        const result = await sendOrderReceiptEmail(
            testEmail,
            'Test Customer',
            {
                orderId: 999,
                referenceNumber: 'TEST-001',
                transactionId: 'TXN' + Date.now(),
                orderDate: new Date(),
                paymentMethod: 'E-Wallet',
                subtotal: 1000,
                shippingCost: 100,
                extraDeliveryFee: 50,
                taxAmount: 120,
                totalAmount: 1270,
                items: [
                    {
                        name: 'Test Office Chair',
                        quantity: 2,
                        price: 500,
                        variationName: 'Ergonomic',
                        color: 'Black'
                    },
                    {
                        name: 'Test Desk',
                        quantity: 1,
                        price: 1000,
                        variationName: null,
                        color: null
                    }
                ]
            }
        );
        
        console.log('\n📊 Test Result:');
        console.log(JSON.stringify(result, null, 2));
        
        if (result.success) {
            console.log('\n✅ SUCCESS: Email sent successfully!');
            if (result.messageId) {
                console.log('📧 Message ID:', result.messageId);
            }
            console.log('\n💡 Please check your inbox (and spam folder) for the test email.');
        } else {
            console.log('\n❌ FAILED: Email not sent');
            console.log('Error:', result.message);
            if (result.error) {
                console.log('Error details:', result.error);
            }
            if (result.errorDetails) {
                console.log('Error details:', JSON.stringify(result.errorDetails, null, 2));
            }
        }
    } catch (error) {
        console.error('\n❌ EXCEPTION:', error);
        console.error('Error stack:', error.stack);
    }
    
    console.log('\n✨ Test completed!');
    process.exit(0);
}

testReceiptEmail();

