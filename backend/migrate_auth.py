import asyncio
from sqlalchemy import text
from database import engine

async def migrate():
    async with engine.begin() as conn:
        try:
            print("Adding is_verified...")
            await conn.execute(text("ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT TRUE"))
        except Exception as e:
            print(f"Skipped is_verified: {e}")
            
        try:
            print("Adding verification_code...")
            await conn.execute(text("ALTER TABLE users ADD COLUMN verification_code VARCHAR(6)"))
        except Exception as e:
            print(f"Skipped verification_code: {e}")
            
        try:
            print("Adding verification_code_expires_at...")
            await conn.execute(text("ALTER TABLE users ADD COLUMN verification_code_expires_at TIMESTAMP WITH TIME ZONE"))
        except Exception as e:
            print(f"Skipped verification_code_expires_at: {e}")
            
        try:
            print("Adding reset_token...")
            await conn.execute(text("ALTER TABLE users ADD COLUMN reset_token VARCHAR(255)"))
        except Exception as e:
            print(f"Skipped reset_token: {e}")
            
        try:
            print("Adding reset_token_expires_at...")
            await conn.execute(text("ALTER TABLE users ADD COLUMN reset_token_expires_at TIMESTAMP WITH TIME ZONE"))
        except Exception as e:
            print(f"Skipped reset_token_expires_at: {e}")

        try:
            print("Adding avatar_color...")
            await conn.execute(text("ALTER TABLE users ADD COLUMN avatar_color VARCHAR(20)"))
        except Exception as e:
            print(f"Skipped avatar_color: {e}")

    print("Migration complete!")

if __name__ == "__main__":
    asyncio.run(migrate())
