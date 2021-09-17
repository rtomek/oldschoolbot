import { TextChannel } from 'discord.js';
import { Event, EventStore } from 'klasa';

import { Channel, Events } from '../lib/constants';

export default class extends Event {
	public constructor(store: EventStore, file: string[], directory: string) {
		super(store, file, directory, {
			once: false,
			event: Events.ServerNotification
		});
	}

	async run(message: string) {
		const channel = this.client.channels.cache.get(
			this.client.production ? Channel.Notifications : '680770361893322761'
		);
		(channel as TextChannel).send(message);
	}
}
