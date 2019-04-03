import React = require("react")
import { observer } from "mobx-react";
import { FieldWaiting, Opt } from '../../../fields/Field';
import { VideoField } from '../../../fields/VideoField';
import { FieldView, FieldViewProps } from './FieldView';
import "./VideoBox.scss";
import Measure from "react-measure";
import { action, trace, observable, IReactionDisposer, computed, reaction } from "mobx";
import { KeyStore } from "../../../fields/KeyStore";
import { number } from "prop-types";

@observer
export class VideoBox extends React.Component<FieldViewProps> {

    private _reactionDisposer: Opt<IReactionDisposer>;
    private _videoRef = React.createRef<HTMLVideoElement>()
    public static LayoutString() { return FieldView.LayoutString(VideoBox) }

    constructor(props: FieldViewProps) {
        super(props);
    }

    @computed private get curPage() { return this.props.doc.GetNumber(KeyStore.CurPage, -1); }


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
            if (!nativeHeight && newNativeHeight != nativeHeight && !isNaN(newNativeHeight)) {
                this.props.doc.SetNumber(KeyStore.Height, newNativeHeight / nativeWidth * this.props.doc.GetNumber(KeyStore.Width, 0));
                this.props.doc.SetNumber(KeyStore.NativeHeight, newNativeHeight);
            }
        } else {
            this._loaded = true;
        }
    }

    get player(): HTMLVideoElement | undefined {
        return this._videoRef.current ? this._videoRef.current.getElementsByTagName("video")[0] : undefined;
    }

    @action
    setVideoRef = (vref: HTMLVideoElement | null) => {
        if (this.curPage >= 0 && vref) {
            vref!.currentTime = this.curPage;
            (vref! as any).AHackBecauseSomethingResetsTheVideoToZero = this.curPage;
        }
    }

    render() {
        let field = this.props.doc.GetT(this.props.fieldKey, VideoField);
        if (!field || field === FieldWaiting) {
            return <div>Loading</div>
        }
        let path = field.Data.href;
        trace();
        return (
            <Measure onResize={this.setScaling}>
                {({ measureRef }) =>
                    <div style={{ width: "100%", height: "auto" }} ref={measureRef}>
                        <video className="videobox-cont" onClick={() => { }} ref={this.setVideoRef}>
                            <source src={path} type="video/mp4" />
                            Not supported.
                        </video>
                    </div>
                }
            </Measure>
        )
    }
}