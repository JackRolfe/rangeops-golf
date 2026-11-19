export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** Sends mail. Locally it only writes to the console; nothing leaves the machine. */
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export const consoleMailer: Mailer = {
  async send(mail) {
    console.log(`\n✉️  Mail to ${mail.to}: ${mail.subject}\n${mail.text}\n`);
  },
};

/** Keeps mail in memory, for tests. */
export class CapturingMailer implements Mailer {
  sent: Mail[] = [];
  async send(mail: Mail) {
    this.sent.push(mail);
  }
  last(): Mail {
    const m = this.sent.at(-1);
    if (!m) throw new Error('No mail sent');
    return m;
  }
}
