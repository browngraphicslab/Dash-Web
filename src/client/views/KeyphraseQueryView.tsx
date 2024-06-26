import { observer } from "mobx-react";
import React = require("react");
import "./KeyphraseQueryView.scss";

// tslint:disable-next-line: class-name
export interface KP_Props {
    keyphrases: string;
}

@observer
export class KeyphraseQueryView extends React.Component<KP_Props>{
    constructor(props: KP_Props) {
        super(props);
    }

    render() {
        const kps = this.props.keyphrases.toString();
        const keyterms = this.props.keyphrases.split(',');
        return (
            <div>
                <h5>Select queries to send:</h5>
                <form>
                    {keyterms.map((kp: string) => {
                        //return (<p>{"-" + kp}</p>);
                        return (<p><label>
                            <input name="query" type="radio" />
                            <span>{kp}</span>
                        </label></p>);
                    })}
                </form>
            </div>
        );
    }
}