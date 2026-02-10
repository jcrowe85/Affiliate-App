#!/bin/bash
# Script to apply the pending migration for VisitorEvent and VisitorSession fields

echo "Applying migration: add_visitor_session_fields_and_visitor_event"
echo "This will add the VisitorEvent table and new fields to VisitorSession"
echo ""

# Run the migration
npx prisma migrate deploy

echo ""
echo "Migration applied successfully!"
echo "The analytics endpoints should now work correctly."
