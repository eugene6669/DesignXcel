-- Adds a column to control testimonial visibility from reviews
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ProductReviews' AND COLUMN_NAME = 'ShowAsTestimonial')
BEGIN
  ALTER TABLE ProductReviews ADD ShowAsTestimonial BIT NOT NULL DEFAULT 0;
END
GO
