import React = require("react");
import { FieldViewProps, FieldView } from './FieldView';
import { FieldWaiting } from '../../../fields/Field';
import { observer } from "mobx-react";
import { ContextMenu } from "../../views/ContextMenu";
import { observable, action } from 'mobx';
import { KeyStore } from '../../../fields/KeyStore';
import { AudioField } from "../../../fields/AudioField";
import "./AudioBox.scss";
import { NumberField } from "../../../fields/NumberField";

@observer
export class AudioBox extends React.Component<FieldViewProps> {

    public static LayoutString() { return FieldView.LayoutString(AudioBox); }

    constructor(props: FieldViewProps) {
        super(props);
    }



    componentDidMount() {
    }

    componentWillUnmount() {
    }


    render() {
        let field = this.props.Document.Get(this.props.fieldKey);
        let path = field === FieldWaiting ? "http://techslides.com/demos/samples/sample.mp3" :
            field instanceof AudioField ? field.Data.href : "http://techslides.com/demos/samples/sample.mp3";

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