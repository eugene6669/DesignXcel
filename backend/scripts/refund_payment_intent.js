/**
 * Script to refund a specific Stripe payment intent
 * Usage: node scripts/refund_payment_intent.js <payment_intent_id> [refund_amount]
 * 
 * Example:
 * node scripts/refund_payment_intent.js pm_1SXNQEPoc51pdmcahKQtPcua
 * node scripts/refund_payment_intent.js pi_1SXNQEPoc51pdmcahKQtPcua 1000
 */

require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const paymentIntentId = process.argv[2];
const refundAmount = process.argv[3] ? parseFloat(process.argv[3]) : null;

if (!paymentIntentId) {
    console.error('❌ Error: Payment intent ID is required');
    console.log('Usage: node scripts/refund_payment_intent.js <payment_intent_id> [refund_amount]');
    process.exit(1);
}

async function refundPaymentIntent() {
    try {
        console.log(`\n🔄 Processing refund for payment intent: ${paymentIntentId}\n`);
        
        // Check if it's a payment method ID (pm_) and try to find payment intent
        let actualPaymentIntentId = paymentIntentId;
        
        if (paymentIntentId.startsWith('pm_')) {
            console.log('⚠️  Detected payment method ID (pm_). Searching for associated payment intent...');
            // Payment methods don't have direct refunds, need to find payment intent
            // This is a simplified approach - in production, you'd search your database
            console.log('❌ Payment method IDs cannot be refunded directly.');
            console.log('   Please provide the Payment Intent ID (starts with pi_) instead.');
            console.log('   You can find it in your Stripe Dashboard under Payments.');
            process.exit(1);
        }
        
        if (!paymentIntentId.startsWith('pi_')) {
            console.log('⚠️  Warning: Payment intent IDs typically start with "pi_"');
            console.log('   Proceeding anyway...\n');
        }
        
        // Retrieve payment intent
        const paymentIntent = await stripe.paymentIntents.retrieve(actualPaymentIntentId);
        console.log(`✅ Payment Intent Retrieved:`);
        console.log(`   ID: ${paymentIntent.id}`);
        console.log(`   Status: ${paymentIntent.status}`);
        console.log(`   Amount: ${paymentIntent.amount} cents (₱${(paymentIntent.amount / 100).toFixed(2)})`);
        console.log(`   Currency: ${paymentIntent.currency}`);
        console.log(`   Created: ${new Date(paymentIntent.created * 1000).toLocaleString()}\n`);
        
        // Check if already refunded
        if (paymentIntent.status === 'canceled') {
            console.log('❌ Payment intent is already canceled.');
            process.exit(1);
        }
        
        // Check charges
        if (paymentIntent.charges?.data?.length > 0) {
            const charge = paymentIntent.charges.data[0];
            console.log(`   Charge ID: ${charge.id}`);
            console.log(`   Charge Status: ${charge.status}`);
            console.log(`   Charge Refunded: ${charge.refunded}\n`);
            
            if (charge.refunded) {
                console.log('❌ Payment intent is already fully refunded.');
                process.exit(1);
            }
        }
        
        // Calculate refund amount
        let finalRefundAmount = paymentIntent.amount; // Default to full refund
        if (refundAmount) {
            const requestedAmount = Math.round(refundAmount * 100); // Convert to cents
            finalRefundAmount = Math.min(requestedAmount, paymentIntent.amount);
            if (finalRefundAmount < requestedAmount) {
                console.log(`⚠️  Requested amount (₱${refundAmount}) exceeds payment amount. Refunding ₱${(finalRefundAmount / 100).toFixed(2)} instead.\n`);
            }
        }
        
        console.log(`💰 Refunding: ₱${(finalRefundAmount / 100).toFixed(2)} (${finalRefundAmount} cents)\n`);
        
        // Create refund
        const refund = await stripe.refunds.create({
            payment_intent: actualPaymentIntentId,
            amount: finalRefundAmount,
            reason: 'requested_by_customer',
            metadata: {
                refund_type: 'manual_refund',
                refunded_by: 'admin_script',
                refund_date: new Date().toISOString()
            }
        });
        
        console.log(`✅ Refund Created Successfully!\n`);
        console.log(`   Refund ID: ${refund.id}`);
        console.log(`   Status: ${refund.status}`);
        console.log(`   Amount: ${refund.amount} cents (₱${(refund.amount / 100).toFixed(2)})`);
        console.log(`   Currency: ${refund.currency}`);
        console.log(`   Reason: ${refund.reason}`);
        console.log(`\n🔗 View in Stripe Dashboard:`);
        console.log(`   https://dashboard.stripe.com/refunds/${refund.id}\n`);
        
    } catch (error) {
        console.error('\n❌ Error processing refund:');
        console.error(`   Type: ${error.type}`);
        console.error(`   Code: ${error.code}`);
        console.error(`   Message: ${error.message}\n`);
        
        if (error.type === 'StripeInvalidRequestError') {
            if (error.code === 'resource_missing') {
                console.log('💡 Tip: Make sure the payment intent ID is correct.');
                console.log('   Payment intent IDs start with "pi_" (e.g., pi_1234567890)');
            }
        }
        
        process.exit(1);
    }
}

refundPaymentIntent();

