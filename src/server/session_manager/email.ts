import * as nodemailer from "nodemailer";
import { MailOptions } from "nodemailer/lib/json-transport";

export namespace Email {

    const smtpTransport = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
            user: 'brownptcdash@gmail.com',
            pass: 'browngfx1'
        }
    });

    export async function dispatch(recipient: string, subject: string, content: string): Promise<boolean> {
        const mailOptions = {
            to: recipient,
            from: 'brownptcdash@gmail.com',
            subject,
            text: `Hello ${recipient.split("@")[0]},\n\n${content}`
        } as MailOptions;
        return new Promise<boolean>(resolve => {
            smtpTransport.sendMail(mailOptions, (dispatchError: Error | null) => resolve(dispatchError === null));
        });
    }

}