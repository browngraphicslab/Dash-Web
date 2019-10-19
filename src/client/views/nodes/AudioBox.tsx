import React = require("react");
import { FieldViewProps, FieldView } from './FieldView';
import { observer } from "mobx-react";
import "./AudioBox.scss";
import { Cast } from "../../../new_fields/Types";
import { AudioField } from "../../../new_fields/URLField";
import { DocStaticComponent } from "../DocComponent";
import { makeInterface } from "../../../new_fields/Schema";
import { documentSchema } from "./DocumentView";
import { InkingControl } from "../InkingControl";

type AudioDocument = makeInterface<[typeof documentSchema]>;
const AudioDocument = makeInterface(documentSchema);
const defaultField: AudioField = new AudioField(new URL("http://techslides.com/demos/samples/sample.mp3"));

@observer
export class AudioBox extends DocStaticComponent<FieldViewProps, AudioDocument>(AudioDocument) {

    public static LayoutString() { return FieldView.LayoutString(AudioBox); }
    _ref = React.createRef<HTMLAudioElement>();

    componentDidMount() {
        if (this._ref.current) this._ref.current.currentTime = 1;
    }

    render() {
        let field = Cast(this.props.Document[this.props.fieldKey], AudioField, defaultField);
        let path = field.url.href;

        let interactive = this.active() ? "-interactive" : "";
        return (
            <div className="audiobox-container">
                <audio controls ref={this._ref} className={`audiobox-control${interactive}`}>
                    <source src={path} type="audio/mpeg" />
                    Not supported.
                </audio>
            </div>
        );
    }
}