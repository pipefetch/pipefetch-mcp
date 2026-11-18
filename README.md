# pipefetch-mcp

An MCP server that gives Claude, Cursor and other AI tools access to YouTube (transcripts, video
details, channels, search and comments), to what a company's website publishes (its contact details
and its brand) and to public Instagram profiles. It uses the [Pipefetch API](https://pipefetch.com).

Ask your assistant things like:

- "Summarize this video: https://www.youtube.com/watch?v=jNQXAC9IVRw"
- "What did the latest five videos of @mkbhd cover, and which got the most views?"
- "Find this week's most viewed videos about web scraping."
- "What are people saying in the comments of this video?"
- "Find the contact email and the LinkedIn page of apify.com."
- "What are the brand colors and the font of stripe.com?"
- "How many followers does @nasa have on Instagram, and what did it post this week?"

## Without installing anything

The same tools are also served from a hosted MCP server at `https://pipefetch.com/mcp`. If your
tool can connect to a remote server over HTTP, point it there and send your key in the `x-api-key`
header. In Claude Code:

```bash
claude mcp add --transport http pipefetch https://pipefetch.com/mcp --header "x-api-key: pf_your_key"
```

The [MCP guide](https://pipefetch.com/guides/youtube-mcp-server-claude-cursor) has the block for Cursor.
Use this package when your tool starts MCP servers as a local program, as Claude Desktop does.

## Setup

1. Create an API key at [pipefetch.com/dashboard](https://pipefetch.com/dashboard). A new account
   has 100 free credits and needs no card.
2. Add the server to your AI tool. It needs Node.js 20 or newer.

**Claude Desktop, Cursor and most other tools** use the same block. In Claude Desktop it goes into
`claude_desktop_config.json` (Settings, Developer, Edit Config); in Cursor into `.cursor/mcp.json`.

```json
{
  "mcpServers": {
    "pipefetch": {
      "command": "npx",
      "args": ["-y", "pipefetch-mcp"],
      "env": {
        "PIPEFETCH_API_KEY": "pf_your_key"
      }
    }
  }
}
```

**Claude Code**

```bash
claude mcp add --env PIPEFETCH_API_KEY=pf_your_key --transport stdio pipefetch -- npx -y pipefetch-mcp
```

Restart the tool afterwards. The tools below should appear in its tool list.

## Tools

| Tool | What it returns | Credits |
|---|---|---|
| `youtube_transcript` | The transcript of a video as text, with title, channel, length and chapters. Optional time markers. | 1 |
| `youtube_video` | Exact views, likes and comment count, description, publish date, duration, tags, chapters | 1 |
| `youtube_channel` | Subscribers, video count, description, keywords, avatar | 1 |
| `youtube_channel_videos` | The latest uploads of a channel, up to 30, with views and duration | 1 |
| `youtube_channel_shorts` | The latest Shorts of a channel, up to 40 | 1 |
| `youtube_search` | Search results, up to 40, with sorting and upload-date filters | 1 |
| `youtube_comments` | Top or newest comments of a video, up to 100 | 1 per started 20 |
| `website_contacts` | The emails, phone numbers and social profiles a website publishes, its contact page and address | 1 |
| `website_brand` | A company's name, logo, icon, brand colors, fonts and social profiles, from its website | 1 |
| `instagram_profile` | A public Instagram account: exact followers, bio, links, engagement, latest posts and Reels | 2 |

All tools only read public data. Videos can be given as an ID or any YouTube URL; channels as a
handle (`@mkbhd`), a channel ID or a channel URL; websites as a domain (`stripe.com`) or any address on
the site; Instagram accounts as a username, a handle or a profile URL.

## What it costs

Each tool call is one Pipefetch request and uses credits from your account: usually 1, and 2 for an
Instagram profile. Requests
that find nothing (a video without captions, an empty search, comments turned off, a website that
cannot be read or shows no contacts) cost nothing.
Credits are prepaid, from $9 for 3,000, and never expire. See [pricing](https://pipefetch.com/pricing).

An assistant can make several calls for one question. "Compare the last ten videos of this channel"
is one call for the list; reading all ten transcripts would be ten more.

## Good to know

- Every answer is fetched live from YouTube, Instagram or the website you name, so a call takes a few
  seconds.
- A transcript exists only if the video has captions, uploaded or automatic.
- Lists are one page: the latest 30 uploads, up to 40 search results, up to 100 comments.
- Your API key stays on your computer, in your tool's configuration. Anyone who has it can spend
  its credits.
- Pipefetch is an independent service. It is not affiliated with, endorsed by or sponsored by
  YouTube, Google, Instagram or Meta.

## Links

- [Documentation](https://pipefetch.com/docs)
- [JavaScript client](https://github.com/pipefetch/pipefetch-js) and [Python client](https://github.com/pipefetch/pipefetch-python), for use from your own code
- Questions: support@pipefetch.com

MIT licensed.
