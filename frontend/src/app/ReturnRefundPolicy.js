import React from 'react';
import PageHeader from '../shared/components/layout/PageHeader';
import './ReturnRefundPolicy.css';

const ReturnRefundPolicy = () => {
  return (
    <div className="return-refund-policy-page">
      <PageHeader 
        title="Return & Refund Policy" 
        subtitle="Our commitment to your satisfaction"
      />
      
      <div className="policy-container">
        <div className="policy-content">
          <section className="policy-section">
            <h2>Overview</h2>
            <p>
              At DesignXcel, we stand behind the quality of our office furniture products. 
              We want you to be completely satisfied with your purchase. This Return & Refund Policy 
              outlines the terms and conditions for returns, exchanges, and refunds.
            </p>
            <p>
              <strong>Important:</strong> This policy does not cover &quot;change of mind&quot; purchases. 
              Legally, consumers are entitled to repair, replacement, or refund for products with 
              defects or imperfections, but not for buyer errors or a change of mind.
            </p>
            <div className="policy-highlight">
              <p>
                <strong>How returns work on your account:</strong> If there is a problem with your order, 
                file a return while it is still <strong>To Receive</strong> — before you click <strong>Order Received</strong>. 
                Returns for defective or wrong items are not available from the account after you confirm receipt.
              </p>
            </div>
          </section>

          <section className="policy-section">
            <h2>When You Can Request a Return</h2>
            <p>
              Self-service returns (Refund or Replacement) are available only when your order shows 
              <strong> To Receive</strong> in your account order history. This is the period after delivery 
              and before you confirm that you received the order in good condition.
            </p>
            <ul className="policy-list">
              <li>
                <strong>Eligible reasons:</strong> Damaged item, wrong item, or other defect-related issues (not change of mind)
              </li>
              <li>
                <strong>Time limit:</strong> You must submit your request before clicking <strong>Order Received</strong>
              </li>
              <li>
                <strong>After you confirm receipt:</strong> The order moves to Completed and the Return / Refund option 
                is no longer available in your account
              </li>
            </ul>
            <p>
              If you accidentally clicked Order Received, contact customer service as soon as possible. 
              We will review your case, but online self-service returns will not be available for that order.
            </p>
          </section>

          <section className="policy-section">
            <h2>Return Conditions</h2>
            <p>
              When you submit a return request, you will be asked to confirm the following. 
              Our team reviews these during approval:
            </p>
            <ul className="policy-list">
              <li>
                <strong>Original Packaging:</strong> Items should be in their original, undamaged packaging where possible
              </li>
              <li>
                <strong>Unused Condition:</strong> Items should be unused, unmodified, and in their original condition where applicable
              </li>
              <li>
                <strong>All Parts Included:</strong> All parts, accessories, and documentation should be included
              </li>
              <li>
                <strong>Proof of Purchase:</strong> Order receipt or proof of purchase is required
              </li>
              <li>
                <strong>Evidence of Issue:</strong> At least one photo or video showing the damage, defect, or wrong item
              </li>
            </ul>
          </section>

          <section className="policy-section">
            <h2>Confirming &quot;Order Received&quot;</h2>
            <p>
              When your order appears as <strong>To Receive</strong>, inspect your items before clicking <strong>Order Received</strong>.
              This confirms that your order is correct, complete, and free of damage.
            </p>
            <ul className="policy-list">
              <li>
                <strong>Before you confirm:</strong> Check that all items match your order, are undamaged, and include all parts and accessories.
              </li>
              <li>
                <strong>Damaged or wrong item:</strong> Do <strong>not</strong> click Order Received. Use <strong>Return / Refund</strong> 
                and choose <strong>Refund</strong> or <strong>Replacement</strong> while the order is still To Receive.
              </li>
              <li>
                <strong>Accidentally confirmed:</strong> Once you click Order Received, you <strong>cannot</strong> file a return through your account. 
                Contact customer service immediately — we will review your case.
              </li>
            </ul>
            <div className="policy-highlight">
              <p><strong>Customer Service:</strong> designexcellence1@gmail.com | (02) 413-6682</p>
            </div>
          </section>

          <section className="policy-section">
            <h2>How to Request a Return</h2>
            <ol className="policy-list">
              <li>
                <strong>Log in to Your Account:</strong> Go to Order History (<strong>Account → Orders</strong>)
              </li>
              <li>
                <strong>Open a To Receive order:</strong> Use <strong>Return / Refund</strong> (do not click Order Received first)
              </li>
              <li>
                <strong>Choose Refund or Replacement</strong>
              </li>
              <li>
                <strong>Select return reason:</strong> Damaged Item, Wrong Item, or Other Reason
              </li>
              <li>
                <strong>Upload evidence:</strong> At least one image or video of the issue, plus proof of purchase
              </li>
              <li>
                <strong>Submit:</strong> Our team will review within 2–3 business days
              </li>
            </ol>
            <p>
              You will receive an email when your request is approved or declined.
            </p>
          </section>

          <section className="policy-section">
            <h2>Refund Policy</h2>
            <h3>Refund Eligibility</h3>
            <p>
              Refunds apply to approved return requests filed while the order is <strong>To Receive</strong>. 
              Refunds are processed to your original payment method after pickup and verification.
            </p>
            
            <h3>Refund Amount (Pre-Receipt Returns)</h3>
            <p>For approved pre-receipt refund requests:</p>
            <ul className="policy-list">
              <li>
                <strong>Product amount:</strong> Full refund of the returned item price (for the quantities you return)
              </li>
              <li>
                <strong>Delivery fees:</strong> Original delivery charges are <strong>included</strong> in your refund (proportional to items returned on partial returns)
              </li>
              <li>
                <strong>Return shipping:</strong> Paid by DesignXcel — you do not pay return shipping for pre-receipt defective or wrong-item returns
              </li>
            </ul>

            <h3>Refund Processing Time</h3>
            <p>
              After approval, our team arranges pickup. Refunds are typically processed within 5–7 business days 
              after we receive and verify the returned items. Funds appear on your original payment method 
              (e.g. Stripe) within 7–10 business days after processing.
            </p>
          </section>

          <section className="policy-section">
            <h2>Replacement Policy</h2>
            <p>
              If you choose <strong>Replacement</strong>, we send a replacement for the defective or wrong product. 
              The process is:
            </p>
            <ol className="policy-list">
              <li>Your return request is reviewed and approved</li>
              <li>Our delivery team picks up the returned item</li>
              <li>The item is inspected</li>
              <li>A replacement is prepared and shipped to you</li>
            </ol>
            <p>
              <strong>Pre-receipt replacements:</strong> Return shipping is paid by DesignXcel. 
              <strong>Replacement delivery is free.</strong> The replacement will match your original product and variation when available; 
              if unavailable, we will contact you about alternatives.
            </p>
          </section>

          <section className="policy-section">
            <h2>Fees and Shipping</h2>
            <p>
              The following applies to <strong>pre-receipt returns</strong> (orders still in <strong>To Receive</strong> status) 
              for damaged, wrong, or defective items:
            </p>
            <ul className="policy-list">
              <li>
                <strong>Return shipping:</strong> Paid by DesignXcel (seller). You are not charged return shipping for eligible pre-receipt returns.
              </li>
              <li>
                <strong>Original delivery (refunds):</strong> Included in your refund amount when your refund request is approved.
              </li>
              <li>
                <strong>Replacement delivery:</strong> Free — no delivery charge for the replacement shipment.
              </li>
            </ul>
            <p>
              <strong>After Order Received:</strong> Self-service returns are not offered through your account. 
              If you confirmed receipt by mistake or have an exceptional situation, contact customer service — 
              fees and eligibility will be reviewed case by case.
            </p>
          </section>

          <section className="policy-section">
            <h2>When Returns May Be Declined</h2>
            <p>Your return request may be declined if:</p>
            <ul className="policy-list">
              <li>The order is no longer in To Receive status (e.g. you already clicked Order Received)</li>
              <li>The reason is change of mind (not covered by this policy)</li>
              <li>Items do not match the reported issue or required evidence is missing</li>
              <li>Items show damage caused by the customer, not a defect or delivery issue</li>
              <li>Required parts, accessories, documentation, or proof of purchase are missing</li>
              <li>Items do not meet the return conditions outlined in this policy</li>
            </ul>
            <p>
              If your return is declined, you will receive an email with the reason. 
              You may contact customer service if you believe there was an error.
            </p>
          </section>

          <section className="policy-section">
            <h2>Need Help?</h2>
            <p>
              Questions about returns, accidental Order Received confirmations, or order issues? Contact us:
            </p>
            <div className="contact-info">
              <p><strong>Email:</strong> designexcellence1@gmail.com</p>
              <p><strong>Phone:</strong> (02) 413-6682</p>
              <p><strong>Address:</strong> #1 Binmaka Street Cor. Biak na Bato Brgy. Manresa, Quezon City</p>
            </div>
            <p>
              Track return status and orders in your account dashboard under <strong>Orders</strong>.
            </p>
          </section>

          <section className="policy-section">
            <h2>Your Legal Rights</h2>
            <p>
              This policy is in addition to your legal rights as a consumer. Under Philippine consumer protection laws, 
              you are entitled to:
            </p>
            <ul className="policy-list">
              <li>Repair, replacement, or refund for products with defects or imperfections</li>
              <li>Products that match their description and are fit for their intended purpose</li>
              <li>Protection against unfair business practices</li>
            </ul>
            <p>
              This policy does not affect your statutory rights. If you believe your consumer rights have been violated, 
              you may contact the Department of Trade and Industry (DTI) for assistance.
            </p>
          </section>

          <section className="policy-section">
            <h2>Policy Updates</h2>
            <p>
              We reserve the right to update this Return & Refund Policy at any time. Changes are effective 
              upon posting on this page. Please review this policy periodically.
            </p>
            <p><strong>Last Updated:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ReturnRefundPolicy;
