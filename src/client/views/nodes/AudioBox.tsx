import React = require("react");
import { FieldViewProps, FieldView } from './FieldView';
import { observer } from "mobx-react";
import "./AudioBox.scss";
import { Cast } from "../../../new_fields/Types";
import { AudioField } from "../../../new_fields/URLField";

const defaultField: AudioField = new AudioField(new URL("http://techslides.com/demos/samples/sample.mp3"));
@observer
export class AudioBox extends React.Component<FieldViewProps> {

    public static LayoutString() { return FieldView.LayoutString(AudioBox); }

    render() {
        let field = Cast(this.props.Document[this.props.fieldKey], AudioField, defaultField);
        let path = field.url.href;

        return (
            <div>
                <audio controls className="audiobox-cont">
                    <source src={path} type="audio/mpeg" />
                    Not supported.
                </audio>
            </div>
        );
    }
}