import React = require("react");
import { observer } from "mobx-react";
import { FieldView, FieldViewProps } from './FieldView';
import "./VideoBox.scss";
import { action, computed, trace } from "mobx";
import { DocComponent } from "../DocComponent";
import { positionSchema } from "./DocumentView";
import { makeInterface } from "../../../new_fields/Schema";
import { pageSchema } from "./ImageBox";
import { Cast, FieldValue, NumCast, ToConstructor, ListSpec } from "../../../new_fields/Types";
import { VideoField } from "../../../new_fields/URLField";
import Measure from "react-measure";
import "./VideoBox.scss";
import { Field, FieldResult, Opt } from "../../../new_fields/Doc";

type VideoDocument = makeInterface<[typeof positionSchema, typeof pageSchema]>;
const VideoDocument = makeInterface(positionSchema, pageSchema);

@observer
export class VideoBox extends DocComponent<FieldViewProps, VideoDocument>(VideoDocument) {

    private _videoRef: HTMLVideoElement | null = null;
    private _loaded: boolean = false;
    private get initialTimecode() { return FieldValue(this.Document.curPage, -1); }
    public static LayoutString() { return FieldView.LayoutString(VideoBox); }

    public get player(): HTMLVideoElement | undefined {
        if (this._videoRef) {
            return this._videoRef;
        }
    }
    @action
    setScaling = (r: any) => {
        if (this._loaded) {
            // bcz: the nativeHeight should really be set when the document is imported.
            var nativeWidth = FieldValue(this.Document.nativeWidth, 0);
            var nativeHeight = FieldValue(this.Document.nativeHeight, 0);
            var newNativeHeight = nativeWidth * r.entry.height / r.entry.width;
            if (!nativeHeight && newNativeHeight !== nativeHeight && !isNaN(newNativeHeight)) {
                this.Document.height = newNativeHeight / nativeWidth * FieldValue(this.Document.width, 0);
                this.Document.nativeHeight = newNativeHeight;
            }
        } else {
            this._loaded = true;
        }
    }

    componentDidMount() {
        if (this.props.setVideoBox) this.props.setVideoBox(this);
    }

    @action
    setVideoRef = (vref: HTMLVideoElement | null) => {
        this._videoRef = vref;
        if (this.initialTimecode >= 0 && vref) {
            vref.currentTime = this.initialTimecode;
        }
    }
    videoContent(path: string) {
        return <video className="videobox-cont" ref={this.setVideoRef}>
            <source src={path} type="video/mp4" />
            Not supported.
        </video>;
    }

    render() {
        let field = Cast(this.Document[this.props.fieldKey], VideoField);
        if (!field) {
            return <div>Loading</div>;
        }
        let content = this.videoContent(field.url.href);
        return NumCast(this.props.Document.nativeHeight) ?
            content :
            <Measure onResize={this.setScaling}>
                {({ measureRef }) =>
                    <div style={{ width: "100%", height: "auto" }} ref={measureRef}>
                        {content}
                    </div>
                }
            </Measure>;
    }
}