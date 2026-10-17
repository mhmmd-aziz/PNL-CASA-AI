#!/bin/bash

# CASA-AI Database Setup Script
# This script initializes the database and optionally seeds development data

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DB_FILE="$SCRIPT_DIR/casa_ai.db"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           CASA-AI Database Setup Script                   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to print colored output
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[i]${NC} $1"
}

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    print_error "Python 3 is not installed. Please install Python 3.8 or higher."
    exit 1
fi

print_status "Python 3 detected: $(python3 --version)"

# Check if database already exists
if [ -f "$DB_FILE" ]; then
    print_warning "Database file already exists: $DB_FILE"

    echo ""
    echo "Options:"
    echo "  1) Keep existing database (skip initialization)"
    echo "  2) Reinitialize database (DROP ALL DATA)"
    echo "  3) Cancel"
    echo ""
    read -p "Enter choice [1-3]: " choice

    case $choice in
        1)
            print_info "Keeping existing database"
            SKIP_INIT=true
            ;;
        2)
            print_warning "Dropping existing database..."
            rm -f "$DB_FILE"
            print_status "Database removed"
            SKIP_INIT=false
            ;;
        3)
            print_info "Cancelled by user"
            exit 0
            ;;
        *)
            print_error "Invalid choice"
            exit 1
            ;;
    esac
else
    print_info "No existing database found"
    SKIP_INIT=false
fi

# Initialize database
if [ "$SKIP_INIT" = false ]; then
    echo ""
    print_info "Initializing database..."

    if python3 "$SCRIPT_DIR/db_connection.py" init; then
        print_status "Database initialized successfully"
    else
        print_error "Database initialization failed"
        exit 1
    fi
fi

# Ask about seeding data
echo ""
print_info "Development seed data includes:"
echo "  - 5 test users (one for each role)"
echo "  - 4 sample patients"
echo "  - 3 calibration profiles"
echo "  - 4 sample examinations"
echo ""
read -p "Seed development data? (y/N): " seed_choice

if [[ "$seed_choice" =~ ^[Yy]$ ]]; then
    print_info "Seeding development data..."

    if python3 "$SCRIPT_DIR/seeds/seed_data.py"; then
        print_status "Seed data added successfully"

        echo ""
        print_info "Test accounts created:"
        echo "  Admin:        admin@casa-ai.local / admin123"
        echo "  Front Office: frontoffice@casa-ai.local / front123"
        echo "  Analyst:      analyst@casa-ai.local / analyst123"
        echo "  Physician:    physician@casa-ai.local / doctor123"
        echo "  Patient:      patient@casa-ai.local / patient123"
        echo ""
        print_warning "⚠️  Never use these accounts in production!"
    else
        print_error "Seeding failed"
        exit 1
    fi
else
    print_info "Skipping seed data"
fi

# Verify database
echo ""
print_info "Verifying database integrity..."

if python3 "$SCRIPT_DIR/db_connection.py" verify; then
    print_status "Database verification successful"
else
    print_error "Database verification failed"
    exit 1
fi

# Display summary
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Setup Complete!                               ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
print_status "Database: $DB_FILE"
print_status "Tables: 12"
print_status "Views: 3"

if [[ "$seed_choice" =~ ^[Yy]$ ]]; then
    print_status "Development data: Seeded"
else
    print_status "Development data: Not seeded"
fi

echo ""
print_info "Next steps:"
echo "  1. Start the backend server: cd backend && python main.py"
echo "  2. Test API endpoints"
echo "  3. Check database: sqlite3 $DB_FILE"
echo ""

print_warning "Remember to:"
echo "  - Change default passwords in production"
echo "  - Setup regular backups"
echo "  - Configure proper file permissions"
echo ""

exit 0
