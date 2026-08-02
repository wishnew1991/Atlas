import asyncio
import json
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def discover(cmd):
    params = StdioServerParameters(command=cmd, args=[], env={"PYTHONPATH": ""})
    try:
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                tools = await session.list_tools()
                print(f"\n=== {cmd} ===")
                for t in tools.tools:
                    print(f" - {t.name}: {t.description[:80]}")
                return True
    except Exception as e:  # noqa
        print(f"\n=== {cmd} === FAILED: {type(e).__name__}: {e}")
        return False


async def main():
    for cmd in ["agora-mcp", "fewsats-mcp"]:
        await discover(cmd)


if __name__ == "__main__":
    asyncio.run(main())
