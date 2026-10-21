// /bridge/list-channels.js
// Prints every server + text channel the bot can see, with IDs.
// Run after inviting the bot:  npm.cmd run channels

import "dotenv/config";
import { Client, GatewayIntentBits, Events } from "discord.js";

const token = (process.env.DISCORD_TOKEN || "").trim();
if (!token) {
  console.error("DISCORD_TOKEN is missing from bridge/.env");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (c) => {
  console.log(`\nConnected as ${c.user.tag}\n`);
  if (!c.guilds.cache.size) {
    console.log(
      "The bot is not in any server yet. Open the invite URL from the Developer Portal first."
    );
  }
  for (const guild of c.guilds.cache.values()) {
    console.log(`${guild.name}  (server ID ${guild.id})`);
    const channels = await guild.channels.fetch().catch(() => null);
    if (!channels) continue;
    for (const ch of channels.values()) {
      if (!ch || !ch.isTextBased?.() || ch.isDMBased?.()) continue;
      console.log(`   #${ch.name}   ${ch.id}`);
    }
    console.log("");
  }
  await client.destroy();
  process.exit(0);
});

client.login(token).catch((err) => {
  console.error("Login failed:", err.message);
  process.exit(1);
});
