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
          {/* Introduction */}
          <section className="policy-section">
            <h2>Overview</h2>
            <p>
              At DesignXcel, we stand behind the quality of our office furniture products. 
              We want you to be completely satisfied with your purchase. This Return & Refund Policy 
              outlines the terms and conditions for returns, exchanges, and refunds.
            </p>
            <p>
              <strong>Important:</strong> This policy does not cover "change of mind" purchases. 
              Legally, consumers are entitled to repair, replacement, or refund for products with 
              defects or imperfections, but not for buyer errors or a change of mind.
            </p>
          </section>

          {/* Return Timeframe */}
          <section className="policy-section">
            <h2>Return Timeframe</h2>
            <p>
              You have <strong>30 days from the date of delivery</strong> to request a return or exchange. 
              Returns requested after this period will not be accepted unless there are exceptional 
              circumstances, which will be evaluated on a case-by-case basis.
            </p>
            <div className="policy-highlight">
              <p><strong>⏰ Return Window:</strong> 30 days from delivery date</p>
            </div>
          </section>

          {/* Return Conditions */}
          <section className="policy-section">
            <h2>Return Conditions</h2>
            <p>To be eligible for a return or exchange, items must meet the following requirements:</p>
            <ul className="policy-list">
              <li>
                <strong>Original Packaging:</strong> Items must be in their original, undamaged packaging
              </li>
              <li>
                <strong>Unused Condition:</strong> Items must be unused, unmodified, and in their original condition
              </li>
              <li>
                <strong>All Parts Included:</strong> All parts, accessories, and documentation must be included
              </li>
              <li>
                <strong>Proof of Purchase:</strong> Original receipt or other proof of purchase is required
              </li>
              <li>
                <strong>Evidence of Defect:</strong> For defective items, photos or videos showing the defect must be provided
              </li>
            </ul>
          </section>

          {/* Return Process */}
          <section className="policy-section">
            <h2>How to Request a Return</h2>
            <ol className="policy-list">
              <li>
                <strong>Log in to Your Account:</strong> Go to your order history in your account dashboard
              </li>
              <li>
                <strong>Select the Order:</strong> Find the order you wish to return and click the "Return" button
              </li>
              <li>
                <strong>Choose Action Type:</strong> Select either "Refund" or "Replacement"
              </li>
              <li>
                <strong>Select Return Reason:</strong> Choose "Damaged Item" or "Other Reason"
              </li>
              <li>
                <strong>Provide Evidence:</strong> Upload at least one image or video showing the defect or issue
              </li>
              <li>
                <strong>Confirm Conditions:</strong> Check all required return condition boxes
              </li>
              <li>
                <strong>Submit Request:</strong> Submit your return request for review
              </li>
            </ol>
            <p>
              Once submitted, our team will review your request within 2-3 business days. 
              You will receive an email notification regarding the approval or decline of your return request.
            </p>
          </section>

          {/* Refund Policy */}
          <section className="policy-section">
            <h2>Refund Policy</h2>
            <h3>Refund Eligibility</h3>
            <p>
              Refunds are available for orders that meet all return conditions and are approved by our team. 
              Refunds will be processed to your original payment method.
            </p>
            
            <h3>Refund Amount Calculation</h3>
            <p>The refund amount is calculated as follows:</p>
            <ul className="policy-list">
              <li>
                <strong>Product Amount:</strong> Full refund of the product purchase price (after discounts)
              </li>
              <li>
                <strong>Delivery Fees:</strong> Original delivery charges are <strong>non-refundable</strong>
              </li>
              <li>
                <strong>Return Shipping:</strong> Customer is responsible for return shipping costs unless the 
                product is defective or was damaged during initial delivery
              </li>
            </ul>

            <h3>Refund Processing Time</h3>
            <p>
              Once your return is approved and the items are picked up by our delivery team, refunds are 
              typically processed within 5-7 business days. The refund will appear in your original payment 
              method (Stripe) within 7-10 business days after processing.
            </p>
          </section>

          {/* Replacement Policy */}
          <section className="policy-section">
            <h2>Replacement Policy</h2>
            <p>
              If you choose "Replacement" as your action type, we will send you a replacement item for the 
              defective or damaged product. The replacement process works as follows:
            </p>
            <ol className="policy-list">
              <li>Your return request is reviewed and approved</li>
              <li>Our delivery team picks up the returned item from your location</li>
              <li>The returned item is inspected and marked as damaged in our inventory</li>
              <li>A replacement item is prepared and shipped to you</li>
              <li>You receive the replacement item through our normal delivery process</li>
            </ol>
            <p>
              <strong>Note:</strong> Replacement items will be the same product and variation as your original order. 
              If the same item is unavailable, we will contact you to discuss alternatives.
            </p>
          </section>

          {/* Fees and Charges */}
          <section className="policy-section">
            <h2>Fees and Charges</h2>
            
            <h3>Shipping Costs</h3>
            <ul className="policy-list">
              <li>
                <strong>Return Shipping:</strong> Customer is responsible for return shipping charges unless 
                the product is defective or was damaged during initial delivery
              </li>
              <li>
                <strong>Original Delivery Charges:</strong> Non-refundable, as delivery service has already been provided
              </li>
              <li>
                <strong>Replacement Delivery:</strong> Free delivery for replacement items
              </li>
            </ul>
          </section>

          {/* Return Decline */}
          <section className="policy-section">
            <h2>When Returns May Be Declined</h2>
            <p>Your return request may be declined if:</p>
            <ul className="policy-list">
              <li>The return window (30 days) has expired</li>
              <li>Items are not in original condition or packaging</li>
              <li>Items show signs of use, modification, or damage caused by the customer</li>
              <li>Required parts, accessories, or documentation are missing</li>
              <li>No proof of purchase is provided</li>
              <li>Items do not meet the return conditions outlined in this policy</li>
              <li>The return is for "change of mind" reasons (not covered by this policy)</li>
            </ul>
            <p>
              If your return is declined, you will receive an email notification with the reason for the decline.
            </p>
          </section>

          {/* Contact Information */}
          <section className="policy-section">
            <h2>Need Help?</h2>
            <p>
              If you have questions about our Return & Refund Policy or need assistance with a return request, 
              please contact our customer service team:
            </p>
            <div className="contact-info">
              <p><strong>Email:</strong> designexcellence1@gmail.com</p>
              <p><strong>Phone:</strong> (02) 413-6682</p>
              <p><strong>Address:</strong> #1 Binmaka Street Cor. Biak na Bato Brgy. Manresa, Quezon City</p>
            </div>
            <p>
              You can also visit your account dashboard to track your return request status and view your order history.
            </p>
          </section>

          {/* Legal Rights */}
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

          {/* Policy Updates */}
          <section className="policy-section">
            <h2>Policy Updates</h2>
            <p>
              We reserve the right to update this Return & Refund Policy at any time. Changes will be effective 
              immediately upon posting on this page. We encourage you to review this policy periodically to stay 
              informed about our return and refund procedures.
            </p>
            <p><strong>Last Updated:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ReturnRefundPolicy;

