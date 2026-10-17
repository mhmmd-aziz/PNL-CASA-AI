"""
Database connection and management module for CASA-AI

This module provides:
- SQLite database connection with proper configuration
- Database initialization from schema files
- Connection pooling
- Transaction management
- Query helpers
"""

import sqlite3
import os
from pathlib import Path
from contextlib import contextmanager
from typing import Optional, List, Dict, Any, Tuple
import json
from datetime import datetime


# Database configuration
DB_DIR = Path(__file__).parent
DB_FILE = DB_DIR / "casa_ai.db"
SCHEMA_FILES = [
    DB_DIR / "schema.sql",
    DB_DIR / "schema_part2.sql"
]


class DatabaseConnection:
    """Manages SQLite database connections with proper configuration"""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or DB_FILE
        self._connection: Optional[sqlite3.Connection] = None

    def connect(self) -> sqlite3.Connection:
        """
        Establish database connection with proper configuration

        Returns:
            sqlite3.Connection: Database connection object
        """
        if self._connection is None:
            self._connection = sqlite3.connect(
                str(self.db_path),
                check_same_thread=False,  # Allow multi-threaded access
                timeout=30.0  # Wait up to 30 seconds for locks
            )

            # Enable foreign key constraints (CRITICAL)
            self._connection.execute("PRAGMA foreign_keys = ON")

            # Enable WAL mode for better concurrent access
            self._connection.execute("PRAGMA journal_mode = WAL")

            # Set row factory to return dict-like rows
            self._connection.row_factory = sqlite3.Row

        return self._connection

    def close(self):
        """Close database connection"""
        if self._connection:
            self._connection.close()
            self._connection = None

    def __enter__(self):
        """Context manager entry"""
        return self.connect()

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        if self._connection:
            if exc_type is None:
                self._connection.commit()
            else:
                self._connection.rollback()
        self.close()


# Global connection instance
_db_connection = DatabaseConnection()


def get_connection() -> sqlite3.Connection:
    """
    Get database connection (singleton pattern)

    Returns:
        sqlite3.Connection: Active database connection
    """
    return _db_connection.connect()


@contextmanager
def get_transaction():
    """
    Context manager for database transactions

    Usage:
        with get_transaction() as conn:
            conn.execute("INSERT INTO users (...) VALUES (...)")
            conn.execute("INSERT INTO audit_logs (...) VALUES (...)")
        # Auto-commit on success, auto-rollback on exception
    """
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def initialize_database(force: bool = False) -> bool:
    """
    Initialize database from schema files

    Args:
        force: If True, drop existing database and recreate

    Returns:
        bool: True if initialization successful

    Raises:
        FileNotFoundError: If schema files not found
        sqlite3.Error: If database operation fails
    """
    if force and DB_FILE.exists():
        print(f"[WARNING] Dropping existing database: {DB_FILE}")
        DB_FILE.unlink()

    # Check if database already initialized
    if DB_FILE.exists() and not force:
        conn = get_connection()
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
        )
        if cursor.fetchone():
            print(f"[INFO] Database already initialized: {DB_FILE}")
            return True

    print(f"[INFO] Initializing database: {DB_FILE}")

    # Ensure database directory exists
    DB_DIR.mkdir(parents=True, exist_ok=True)

    # Read and execute schema files
    conn = get_connection()

    for schema_file in SCHEMA_FILES:
        if not schema_file.exists():
            raise FileNotFoundError(f"Schema file not found: {schema_file}")

        print(f"[INFO] Executing schema: {schema_file.name}")

        with open(schema_file, 'r') as f:
            schema_sql = f.read()

        # Execute schema (may contain multiple statements)
        conn.executescript(schema_sql)

    conn.commit()

    # Verify tables created
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    )
    tables = [row[0] for row in cursor.fetchall()]

    print(f"[SUCCESS] Database initialized with {len(tables)} tables:")
    for table in tables:
        print(f"  - {table}")

    return True


def execute_query(
    query: str,
    params: Optional[Tuple] = None,
    fetch_one: bool = False
) -> Optional[List[sqlite3.Row]]:
    """
    Execute a SELECT query and return results

    Args:
        query: SQL SELECT query
        params: Query parameters (optional)
        fetch_one: If True, return single row instead of list

    Returns:
        List of rows (dict-like), single row if fetch_one=True, or None
    """
    conn = get_connection()
    cursor = conn.execute(query, params or ())

    if fetch_one:
        return cursor.fetchone()
    return cursor.fetchall()


def execute_update(
    query: str,
    params: Optional[Tuple] = None,
    commit: bool = True
) -> int:
    """
    Execute an INSERT/UPDATE/DELETE query

    Args:
        query: SQL query
        params: Query parameters (optional)
        commit: Whether to commit immediately

    Returns:
        int: Last inserted row ID or number of affected rows
    """
    conn = get_connection()
    cursor = conn.execute(query, params or ())

    if commit:
        conn.commit()

    # Return lastrowid for INSERT, rowcount for UPDATE/DELETE
    return cursor.lastrowid if cursor.lastrowid else cursor.rowcount


def row_to_dict(row: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    """
    Convert sqlite3.Row to dictionary

    Args:
        row: sqlite3.Row object

    Returns:
        Dictionary representation or None
    """
    if row is None:
        return None
    return dict(row)


def rows_to_dict_list(rows: List[sqlite3.Row]) -> List[Dict[str, Any]]:
    """
    Convert list of sqlite3.Row to list of dictionaries

    Args:
        rows: List of sqlite3.Row objects

    Returns:
        List of dictionary representations
    """
    return [dict(row) for row in rows]


def json_serialize(obj: Any) -> str:
    """
    Serialize Python object to JSON string for database storage

    Args:
        obj: Python object (dict, list, etc.)

    Returns:
        JSON string
    """
    return json.dumps(obj, ensure_ascii=False, default=str)


def json_deserialize(json_str: Optional[str]) -> Any:
    """
    Deserialize JSON string from database to Python object

    Args:
        json_str: JSON string from database

    Returns:
        Python object (dict, list, etc.) or None
    """
    if json_str is None or json_str == "":
        return None
    return json.loads(json_str)


def verify_database() -> Dict[str, Any]:
    """
    Verify database integrity and return statistics

    Returns:
        Dictionary with database statistics
    """
    conn = get_connection()

    # Get table count
    cursor = conn.execute(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table'"
    )
    table_count = cursor.fetchone()[0]

    # Get tables with row counts
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    )
    tables = cursor.fetchall()

    table_stats = {}
    for table_row in tables:
        table_name = table_row[0]
        cursor = conn.execute(f"SELECT COUNT(*) FROM {table_name}")
        row_count = cursor.fetchone()[0]
        table_stats[table_name] = row_count

    # Check foreign key integrity
    cursor = conn.execute("PRAGMA foreign_key_check")
    fk_violations = cursor.fetchall()

    return {
        "db_path": str(DB_FILE),
        "db_size_bytes": DB_FILE.stat().st_size if DB_FILE.exists() else 0,
        "table_count": table_count,
        "table_stats": table_stats,
        "foreign_key_violations": len(fk_violations),
        "foreign_keys_enabled": conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    }


# Helper function for audit logging
def log_audit_event(
    actor_id: Optional[int],
    action_type: str,
    description: str,
    target_type: Optional[str] = None,
    target_id: Optional[int] = None,
    actor_email: Optional[str] = None,
    actor_role: Optional[str] = None,
    actor_ip: Optional[str] = None,
    before_state: Optional[Dict] = None,
    after_state: Optional[Dict] = None,
    result: str = "SUCCESS",
    error_message: Optional[str] = None
) -> int:
    """
    Log an audit event to the audit_logs table

    Args:
        actor_id: ID of user performing action
        action_type: Type of action (e.g., 'CREATE_PATIENT', 'RUN_ANALYSIS')
        description: Human-readable description
        target_type: Type of target resource (optional)
        target_id: ID of target resource (optional)
        actor_email: Email of actor (snapshot)
        actor_role: Role of actor (snapshot)
        actor_ip: IP address of actor
        before_state: State before change (optional)
        after_state: State after change (optional)
        result: Result status ('SUCCESS', 'FAILURE', 'UNAUTHORIZED')
        error_message: Error message if result is not SUCCESS

    Returns:
        int: Audit log entry ID
    """
    query = """
        INSERT INTO audit_logs (
            actor_id, actor_email, actor_role, actor_ip,
            action_type, target_type, target_id, description,
            before_state, after_state, result, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """

    params = (
        actor_id,
        actor_email,
        actor_role,
        actor_ip,
        action_type,
        target_type,
        target_id,
        description,
        json_serialize(before_state) if before_state else None,
        json_serialize(after_state) if after_state else None,
        result,
        error_message
    )

    return execute_update(query, params)


if __name__ == "__main__":
    """
    Run this module directly to initialize or verify database

    Usage:
        python db_connection.py init          # Initialize database
        python db_connection.py init --force  # Drop and recreate database
        python db_connection.py verify        # Verify database integrity
    """
    import sys

    if len(sys.argv) < 2:
        print("Usage:")
        print("  python db_connection.py init [--force]")
        print("  python db_connection.py verify")
        sys.exit(1)

    command = sys.argv[1]

    if command == "init":
        force = "--force" in sys.argv
        try:
            initialize_database(force=force)
            print("\n[SUCCESS] Database initialization complete")
        except Exception as e:
            print(f"\n[ERROR] Database initialization failed: {e}")
            sys.exit(1)

    elif command == "verify":
        try:
            stats = verify_database()
            print("\n=== Database Statistics ===")
            print(f"Path: {stats['db_path']}")
            print(f"Size: {stats['db_size_bytes']:,} bytes")
            print(f"Tables: {stats['table_count']}")
            print(f"Foreign Keys: {'ENABLED' if stats['foreign_keys_enabled'] else 'DISABLED'}")
            print(f"FK Violations: {stats['foreign_key_violations']}")
            print("\n=== Table Row Counts ===")
            for table, count in stats['table_stats'].items():
                print(f"  {table:30s}: {count:>6,} rows")
            print("\n[SUCCESS] Database verification complete")
        except Exception as e:
            print(f"\n[ERROR] Database verification failed: {e}")
            sys.exit(1)

    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
