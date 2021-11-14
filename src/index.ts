import "dotenv/config";
import Discord, { Intents, TextChannel } from "discord.js";
import unhomoglyph from "./unhomoglyph";

const client = new Discord.Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
  ],
});

let protectedUsers: { id: string; username: string; discriminator: string }[] = [
  {id: "0", username: "ENSDOMAIN.ETH AIRDROP", discriminator: "0000"},
  {id: "0", username: "ensdomains airdrop", discriminator: "0000"},
  {id: "0", username: "ens.eth", discriminator: "0000"},
  {id: "0", username: "ensdomain.eth", discriminator: "0000"},
  {id: "0", username: "Announcement", discriminator: "0000"},
  {id: "0", username: "Server", discriminator: "0000"},
];
const protectedRoles: string[] = [];

client.login(process.env.DISCORD_API_KEY!).then(async () => {
  const guild = await client.guilds.fetch(process.env.GUILD_ID!);
  const members = await guild.members.fetch();

  const membersList = members.toJSON();

  await Promise.all([
    addRoleToProtectedList(guild, "874687680854753291") /* Collab.Land */,
    addRoleToProtectedList(guild, "742386352816914552") /* ens-team */,
    addRoleToProtectedList(guild, "903477671697190942") /* Integromat */,
  ]);
  protectedUsers = uniqBy(protectedUsers, (a) => JSON.stringify({ id: a.id, username: a.username }));

  console.log("Number of protected users:", protectedUsers.length);

  for (const member of membersList) {
    checkAgainstProtected(member);
  }

  client.on("guildMemberUpdate", (oldMember, newMember) => {
    const newMemberRole = newMember.roles.cache.toJSON();
    const oldMemberRole = oldMember.roles.cache.toJSON();
    const addedRole = newMemberRole.filter((x) => !oldMemberRole.includes(x));
    const removedRole = oldMemberRole.filter((x) => !newMemberRole.includes(x));
    /* If role added to user, add protection */
    if (addedRole.map((r) => r.name).length && protectedRoles.includes(addedRole[0].id)) {
      console.log(`Adding ${newMember.user.username} to the protected list (role added)`);
      protectedUsers.push({
        id: newMember.user.id,
        username: newMember.user.username,
        discriminator: newMember.user.discriminator,
      });
      if (newMember.nickname && newMember.nickname != newMember.user.username) {
        console.log(`Adding ${newMember.nickname} to the protected list (role added)`);
        protectedUsers.push({
          id: newMember.user.id,
          username: newMember.nickname,
          discriminator: newMember.user.discriminator,
        });
      }
    }

    /* If role removed from user, remove protection */
    if (removedRole.map((r) => r.name).length && protectedRoles.includes(removedRole[0].id)) {
      if (newMember.nickname) console.log(`Removing ${newMember.nickname} from the protected list (role removed)`);
      console.log(`Removing ${newMember.user.username} from the protected list (role removed)`);
      protectedUsers = protectedUsers.filter((u) => {
        if (u.username == newMember.user.username && u.id == newMember.id) return false;
        if (u.username == newMember.nickname && u.id == newMember.id) return false;
        return true;
      });
    }

    /* On nickname change (guild-wide) */
    if (oldMember.nickname != newMember.nickname) {
      const isProtectedUser = !!protectedUsers.find((v) => {
        if (oldMember.id == v.id) return true;
      });
      if (isProtectedUser) {
        if (oldMember.nickname) {
          const index = protectedUsers.findIndex((v) => {
            if (oldMember.id == v.id && oldMember.nickname == v.username) return true;
          });
          // Nickname change
          if (newMember.nickname) {
            console.log(
              `Changing (old: ${oldMember.nickname}) ${newMember.nickname} in the protected list (nickname changed)`
            );
            protectedUsers[index].username = newMember.nickname;
          }
          // Nickname removed
          else {
            console.log(`Removing ${newMember.nickname} from the protected list (nickname removed)`);
            protectedUsers.splice(index, 1);
          }
        } else if (newMember.nickname) {
          // Nickname added
          console.log(`Adding ${newMember.nickname} to the protected list (new nickname)`);
          protectedUsers.push({
            id: newMember.id,
            username: newMember.nickname,
            discriminator: newMember.user.discriminator,
          });
        }
      }
    }
    protectedUsers = uniqBy(protectedUsers, (a) => JSON.stringify({ id: a.id, username: a.username }));
    console.log("New number of protected users:", protectedUsers.length);
  });
  client.on("userUpdate", async (oldUser, newUser) => {
    /* On username change (Discord-wide) */
    if (oldUser.username != newUser.username) {
      const isProtectedUser = !!protectedUsers.find((v) => {
        if (oldUser.id == v.id) return true;
      });
      if (!isProtectedUser) {
        const index = protectedUsers.findIndex((v) => {
          if (oldUser.id == v.id && oldUser.username == v.username) return true;
        });
        if(index == -1) return;
        // User change
        console.log(`Changing (old: ${oldUser.username}) ${newUser.username} in the protected list (username changed)`);
        protectedUsers[index].username = newUser.username;
        protectedUsers = uniqBy(protectedUsers, (a) => JSON.stringify({ id: a.id, username: a.username }));
      }
      // Not protected user, pass the new username through the protected list
      else {
        checkAgainstProtected(await guild.members.fetch(newUser.id));
      }

    }
  });
});

async function addRoleToProtectedList(guild: Discord.Guild, roleId: string) {
  protectedRoles.push(roleId);
  await guild.roles.fetch(roleId).then((r) =>
    r?.members.each((u) => {
      if (u.nickname && u.nickname != u.user.username)
        protectedUsers.push({ id: u.user.id, username: u.nickname, discriminator: u.user.discriminator });
      return protectedUsers.push({ id: u.user.id, username: u.user.username, discriminator: u.user.discriminator });
    })
  );
}

function uniqBy(a: { id: string; username: string; discriminator: string }[], key: (a: any) => string) {
  const seen: { [key: string]: boolean } = {};
  return a.filter(function (item) {
    const k = key(item);
    return Object.prototype.hasOwnProperty.call(seen, k) ? false : (seen[k] = true);
  });
}

async function ban(
  scammer: Discord.GuildMember,
  protectedUser: { id: string; username: string; discriminator: string }
) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID!);
  const logsChannel = (await guild.channels.fetch(process.env.LOGS_CHANNEL!)) as TextChannel;

  if (process.env.ASK_BEFORE_BAN == "1") {
    await logsChannel
      .send({
        content: `<@${scammer.id}> (${scammer.nickname ? `nickname: ${scammer.nickname}, ` : ""}username: ${
          scammer.user.username
        }#${scammer.user.discriminator}) tried to impersonate <@${protectedUser.id}>, should they get banned?`,
      })
      .then(async (m) => {
        await m.react("👍").then(async () => await m.react("👎"));
        await m
          .awaitReactions({
            max: 1,
            time: 10 * 60 * 1000,
            errors: ["time"],
            filter: (a, b) => b.username !== client.user?.username,
          })
          .then(async (collected) => {
            const reaction = collected.first();

            if (!reaction) return;
            const user = await reaction.users.fetch().then((u) => u.filter((u) => u.id != client.user?.id).first());
            if (reaction.emoji.name === "👎") {
              m.reply(`Not banning <@${scammer.id}> after vote from <@${user?.id}>`);
              return;
            }
            if (reaction.emoji.name === "👍") {
              await scammer.ban({
                reason: `Impersonating ${protectedUser.username}`,
              });
              m.reply(`<@${scammer.id}> was banned after vote from <@${user?.id}>`);
            }
          })
          .catch((e) => {
            console.log(e);
          });
      });
  } else {
    await scammer.ban({ reason: `Impersonating ${protectedUser.username}` });
    await logsChannel.send(
      `Banned <@${scammer.user.id}> (${scammer.user.username}#${scammer.user.discriminator}) for impersonating <@${protectedUser.id}> (${protectedUser.username}#${protectedUser.discriminator})`
    );
  }
}

function checkAgainstProtected(member: Discord.GuildMember) {
  for (const protectedUser of protectedUsers) {
    if (
      unhomoglyph(member.user.username).toLowerCase() == unhomoglyph(protectedUser.username).toLowerCase() &&
      member.user.id != protectedUser.id
    ) {
      ban(member, protectedUser);
    }
  }
}
