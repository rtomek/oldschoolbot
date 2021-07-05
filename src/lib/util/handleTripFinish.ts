import { MessageAttachment, MessageButton, MessageCollector, TextChannel } from 'discord.js';
import { deepClone } from 'e';
import { KlasaClient, KlasaMessage, KlasaUser } from 'klasa';
import { ItemBank } from 'oldschooljs/dist/meta/types';

import MinionCommand from '../../commands/Minion/minion';
import { Activity, BitField, COINS_ID, Emoji, PerkTier, Time } from '../constants';
import clueTiers from '../minions/data/clueTiers';
import { triggerRandomEvent } from '../randomEvents';
import { ClientSettings } from '../settings/types/ClientSettings';
import { ActivityTaskOptions } from '../types/minions';
import { channelIsSendable, generateContinuationChar, roll, updateGPTrackSetting } from '../util';
import getUsersPerkTier from './getUsersPerkTier';
import { sendToChannelID } from './webhook';

export const collectors = new Map<string, MessageCollector>();

const activitiesToTrackAsPVMGPSource = [
	Activity.GroupMonsterKilling,
	Activity.MonsterKilling,
	Activity.Raids,
	Activity.ClueCompletion
];

export async function handleTripFinish(
	client: KlasaClient,
	user: KlasaUser,
	channelID: string,
	message: string,
	onContinue: undefined | ((message: KlasaMessage) => Promise<KlasaMessage | KlasaMessage[] | null>),
	attachment: MessageAttachment | Buffer | undefined,
	data: ActivityTaskOptions,
	loot: ItemBank | null
) {
	const perkTier = getUsersPerkTier(user);
	const continuationChar = generateContinuationChar(user);
	if (onContinue) {
		message += `\nSay \`${continuationChar}\` to repeat this trip.`;
	}

	if (loot && activitiesToTrackAsPVMGPSource.includes(data.type)) {
		const GP = loot[COINS_ID];
		if (typeof GP === 'number') {
			updateGPTrackSetting(client, ClientSettings.EconomyStats.GPSourcePVMLoot, GP);
		}
	}

	let components = [];

	const clueReceived = loot ? clueTiers.find(tier => loot[tier.scrollID] > 0) : undefined;

	if (clueReceived) {
		message += `\n${Emoji.Casket} **You got a ${clueReceived.name} clue scroll** in your loot.`;
		if (perkTier > PerkTier.One) {
			message += ` Say \`c\` if you want to complete this ${clueReceived.name} clue now.`;
			components.push(
				new MessageButton()
					.setStyle('SECONDARY')
					.setCustomID(`do_${clueReceived.name}_clue`)
					.setLabel('Do Clue Scroll')
			);
		} else {
			message += 'You can get your minion to complete them using `+minion clue easy/medium/etc`';
		}
	}

	if (perkTier > PerkTier.One) {
		components.push(new MessageButton().setStyle('PRIMARY').setCustomID('repeat_trip').setLabel('Repeat Trip'));
	}

	const attachable = attachment
		? attachment instanceof MessageAttachment
			? attachment
			: new MessageAttachment(attachment)
		: undefined;

	const channel = client.channels.cache.get(channelID);

	const msg = await sendToChannelID(client, channelID, {
		content: message,
		image: attachable,
		components: components.reverse()
	});

	const minutes = Math.min(30, data.duration / Time.Minute);
	const randomEventChance = 60 - minutes;
	if (
		channel &&
		!user.bitfield.includes(BitField.DisabledRandomEvents) &&
		roll(randomEventChance) &&
		channel instanceof TextChannel
	) {
		triggerRandomEvent(channel, user);
	}

	if ((!onContinue && !clueReceived) || !msg) return;

	const res = await msg.awaitMessageComponentInteraction({
		filter: i => i.customID === 'repeat_trip' && i.user.id === user.id
	});

	if (!channelIsSendable(channel)) return;

	// const collector = new MessageCollector(channel, {
	// 	filter: (mes: Message) =>
	// 		mes.author === user && (mes.content.toLowerCase() === 'c' || stringMatches(mes.content, continuationChar)),
	// 	time: perkTier > PerkTier.One ? Time.Minute * 10 : Time.Minute * 2,
	// 	max: 1
	// });

	if (res) {
		res.update({ components: [] });
		if (user.minionIsBusy || client.oneCommandAtATimeCache.has(res.user.id)) {
			return;
		}
		client.oneCommandAtATimeCache.add(res.user.id);
		try {
			const fakeMessage = deepClone(msg);
			fakeMessage.author = res.user;
			if (clueReceived && perkTier > PerkTier.One) {
				(client.commands.get('minion') as unknown as MinionCommand).clue(msg, [1, clueReceived.name]);
				return;
			} else if (onContinue) {
				await onContinue(msg).catch(err => {
					channel.send(err);
				});
			}
		} catch (err) {
			console.log(err);
			channel.send(err);
		} finally {
			setTimeout(() => client.oneCommandAtATimeCache.delete(res.user.id), 300);
		}
	}
}
