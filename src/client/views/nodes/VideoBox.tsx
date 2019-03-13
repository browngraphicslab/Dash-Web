import React = require("react")
import { observer } from "mobx-react";
import { FieldWaiting } from '../../../fields/Field';
import { VideoField } from '../../../fields/VideoField';
import { FieldView, FieldViewProps } from './FieldView';
import "./VideoBox.scss";
import Measure from "react-measure";
import { action, trace, observable } from "mobx";
import { KeyStore } from "../../../fields/KeyStore";
import { number } from "prop-types";

@observer
export class VideoBox extends React.Component<FieldViewProps> {

    public static LayoutString() { return FieldView.LayoutString(VideoBox) }

    constructor(props: FieldViewProps) {
        super(props);
    }


    _loaded: boolean = false;

    @action
    setScaling = (r: any) => {
        if (this._loaded) {
            // bcz: the nativeHeight should really be set when the document is imported.
            //      also, the native dimensions could be different for different pages of the PDF
            //      so this design is flawed.
            var nativeWidth = this.props.doc.GetNumber(KeyStore.NativeWidth, 0);
            var nativeHeight = this.props.doc.GetNumber(KeyStore.NativeHeight, 0);
            var newNativeHeight = nativeWidth * r.entry.height / r.entry.width;
            if (newNativeHeight != nativeHeight && !isNaN(newNativeHeight)) {
                this.props.doc.SetNumber(KeyStore.Height, newNativeHeight / nativeWidth * this.props.doc.GetNumber(KeyStore.Width, 0));
                this.props.doc.SetNumber(KeyStore.NativeHeight, newNativeHeight);
            }
        } else {
            this._loaded = true;
        }
    }



    render() {
        let field = this.props.doc.Get(this.props.fieldKey)
        let path = field == FieldWaiting ? "http://techslides.com/demos/sample-videos/small.mp4" :
            field instanceof VideoField ? field.Data.href : "http://techslides.com/demos/sample-videos/small.mp4";

        //setTimeout(action(() => this._loaded = true), 500);
        return (
            <div style={{ width: "100%", height: "Auto" }} >
                <Measure onResize={this.setScaling}>
                    {({ measureRef }) =>
                        <video controls className="videobox-cont" ref={measureRef}>
                            <source src={path} type="video/mp4" />
                            Not supported.
                        </video>
                    }
                </Measure>
            </div>
        )
    }
}