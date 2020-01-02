import * as nodemailer from "nodemailer";
import { MailOptions } from "nodemailer/lib/json-transport";

export namespace CrashEmail {

    export async function dispatch(error: Error, recipients: string[]): Promise<boolean[]> {
        const smtpTransport = nodemailer.createTransport({
            service: 'Gmail',
            auth: {
                user: 'brownptcdash@gmail.com',
                pass: 'browngfx1'
            }
        });
        return Promise.all(recipients.map(recipient => new Promise<boolean>(resolve => {
            const mailOptions = {
                to: recipient,
                from: 'brownptcdash@gmail.com',
                subject: 'Dash Server Crash',
                text: emailText(recipient, error)
            } as MailOptions;
            smtpTransport.sendMail(mailOptions, (dispatchError: Error | null) => resolve(dispatchError === null));
        })));
    }

    function emailText(recipient: string, { name, message, stack }: Error) {
        return [
            `Hey ${recipient.split("@")[0]},`,
            "You, as a Dash Administrator, are being notified of a server crash event. Here's what we know:",
            `name:\n${name}`,
            `message:\n${message}`,
            `stack:\n${stack}`,
            "The server is already restarting itself, but if you're concerned, use the Remote Desktop Connection to monitor progress."
        ].join("\n\n");
    }

}