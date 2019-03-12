import React = require("react")
import { FieldViewProps, FieldView } from './FieldView';
import { FieldWaiting } from '../../../fields/Field';
import { observer } from "mobx-react"
import { VideoField } from '../../../fields/VideoField'; 
import "./VideoBox.scss"
import { ContextMenu } from "../../views/ContextMenu";
import { observable, action } from 'mobx';
import { KeyStore } from '../../../fields/KeyStore';

@observer
export class VideoBox extends React.Component<FieldViewProps> {

    public static LayoutString() { return FieldView.LayoutString(VideoBox) }

    constructor(props: FieldViewProps) {
        super(props);
    }

   

    componentDidMount() {
    }

    componentWillUnmount() {
    }

   
    render() {
        let field = this.props.doc.Get(this.props.fieldKey)
        let path = field == FieldWaiting ? "http://techslides.com/demos/sample-videos/small.mp4":
            field instanceof VideoField ? field.Data.href : "http://techslides.com/demos/sample-videos/small.mp4";
    
        return (
            <div>
                <video width = {200} height = {200} controls className = "videobox-cont">
                    <source src = {path} type = "video/mp4"/>
                    Not supported.
                </video>
            </div>
        )
    }
}