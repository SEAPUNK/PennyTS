import { Context } from 'detritus-client/lib/command';
import fetch from 'node-fetch';
import config from '../../modules/config';
import { DBServer, DBRoles } from '../../modules/db';
import { Role, Message, Reaction, User } from 'detritus-client/lib/structures';
import { ReactionCollector } from '../../modules/collectors/reactionCollector';

export const edit = {
  name: 'edit',
  metadata: {
    description: 'Edit your role color.',
    checks: ['manageRoles', 'attachments'],
  },
  //TODO: Improve this
  run: async (ctx: Context) => {
    let role = ctx.message.content
      .slice(ctx.prefix!.length + ctx.command!.name.length)
      .split(' | ');
    if (!role[1]) {
      ctx.reply(`Usage: ${ctx.prefix}edit role name | #hex`);
      return;
    }
    let blacklist: string[] = [];
    let guild: DBServer = await ctx.commandClient.queryOne(
      `SELECT edits FROM servers WHERE server_id = ${ctx.guildId}`
    );
    if (guild.edits !== 1) {
      ctx.reply('Role edits are not enabled on this server.');
      return;
    }

    let roles: DBRoles[] = await ctx.commandClient
      .query(`SELECT * FROM roles WHERE guild = ${ctx.guildId}`)
      .catch(() => (blacklist = []));

    let r_id: string = '';
    let edit: boolean = true;
    ctx.guild?.roles.forEach((r: Role) => {
      if (r.name.toLowerCase() === role[0].toLowerCase().trim()) r_id = r.id;
    });

    roles.forEach((d) => {
      // TODO: Change to bigint array
      blacklist.push(d.role.toString());
    });
    if (blacklist.includes(r_id)) edit = false;

    if (!edit) {
      ctx.reply('You cannot edit this role.');
      return;
    }

    let hexThing = /^#?[0-9A-F]{6}$/i;
    if (!hexThing.test(role[1])) {
      ctx.reply('Please use a valid hex code.');
      return;
    }
    if (role[1].indexOf('#') !== 0) role[1] = `#${role[1]}`;
    let rte: Role | undefined = undefined;
    ctx.member?.roles.every((r: Role) => {
      if (r.name.toLowerCase() !== role[0].toLowerCase().trim()) {
        return true;
      } else {
        rte = r;
        return false;
      }
    });
    if (!rte) {
      ctx.reply('You can only edit roles you have!');
      return;
    }
    if (ctx.me!.highestRole!.position <= (rte as Role).position) {
      ctx.reply('I cannot edit this role.');
      return;
    }
    await fetch(`${config.imageAPI.url}/messagepreview?id=${ctx.user.id}&username=${ctx.user.username}&avatar_url=${ctx.user.avatarUrl}&color=${role[1]}`, {
      headers: {
        Authorization: config.imageAPI.password,
      },
    })
    .then(resp => resp.arrayBuffer())
    .then(buffer => {
      ctx
      .reply({
        content: `Here is a preview of what your role will look like with ${role[1]}. React with 🇾 if you want to keep it or 🇳 if you do not.`,
          file: {
            data: Buffer.from(buffer),
            filename: 'edit.png',
          },
      })
      .then(async (m: Message) => {
        await m.react('🇾');
        await m.react('🇳');
        let filter = (re: Reaction, u: User) => {
          return (
            (re.emoji.name === '🇾' || re.emoji.name === '🇳') &&
              u.id === ctx.user.id
          );
        };
        let collector = new ReactionCollector(ctx, 30000, m, filter);
        let old = rte!.color.toString(16);
        collector.on('collect', (re: Reaction) => {
          if (re.emoji.name === '🇳') {
            ctx.reply(`I will not edit your role color to ${role[1]}`);
          } else {
            rte!.edit({
              color: parseInt(`0x${role[1].replace('#', '')}`),
              reason: `Requested change by ${
                ctx.member!.username
              }. Used to be ${old}.`,
            });
            ctx.reply(`Your role color is now ${role[1]}. Enjoy!`);
            collector.destroy();
          }
        });
      });
    })
    .catch(console.error);
  },
};
