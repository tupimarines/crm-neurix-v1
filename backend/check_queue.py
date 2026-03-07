import asyncio
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.dependencies import get_redis
from app.config import get_settings

async def main():
    try:
        redis_client = await get_redis()
        # Redis from dependencies is an async generator but let's just get it
    except:
        import redis.asyncio as aioredis
        settings = get_settings()
        redis_client = aioredis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            db=settings.REDIS_DB,
            password=settings.REDIS_PASSWORD or None,
            decode_responses=True
        )

    queue_len = await redis_client.llen("neurix:webhook_queue")
    print(f"Items in neurix:webhook_queue: {queue_len}")
    
    # Peek at the elements without removing them
    if queue_len > 0:
        items = await redis_client.lrange("neurix:webhook_queue", 0, min(queue_len - 1, 4))
        for i, item in enumerate(items):
            print(f"Item {i}: {item[:500]}...") # Print first 500 chars

if __name__ == "__main__":
    asyncio.run(main())
