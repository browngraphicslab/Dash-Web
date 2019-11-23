import { observer } from "mobx-react";
import React = require("react");
import "./KeyphraseQueryView.scss";

// tslint:disable-next-line: class-name
export interface KP_Props {
    keyphrases: string[];
}

@observer
export class KeyphraseQueryView extends React.Component<KP_Props>{
    constructor(props: KP_Props) {
        super(props);
        console.log("FIRST KEY PHRASE: ", props.keyphrases[0]);
    }

    render() {
        return (
            <div>
                <h1>Select queries to send:</h1>
                {this.props.keyphrases.map((kp: string) => {
                    setTimeout(() => {
                        return (<p className="fading">{kp}</p>);
                    }, 1000);

                })}
            </div>
        );
    }
}