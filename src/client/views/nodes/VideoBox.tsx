import React = require("react");
import { observer } from "mobx-react";
import { FieldView, FieldViewProps } from './FieldView';
import "./VideoBox.scss";
import { action, computed } from "mobx";
import { DocComponent } from "../DocComponent";
import { positionSchema } from "./DocumentView";
import { makeInterface } from "../../../new_fields/Schema";
import { pageSchema } from "./ImageBox";
import { Cast, FieldValue } from "../../../new_fields/Types";
import { VideoField } from "../../../new_fields/URLField";
import Measure from "react-measure";
import "./VideoBox.scss";

type VideoDocument = makeInterface<[typeof positionSchema, typeof pageSchema]>;
const VideoDocument = makeInterface(positionSchema, pageSchema);

@observer
export class VideoBox extends DocComponent<FieldViewProps, VideoDocument>(VideoDocument) {

    private _videoRef = React.createRef<HTMLVideoElement>();
    public static LayoutString() { return FieldView.LayoutString(VideoBox); }

    constructor(props: FieldViewProps) {
        super(props);
    }

    @computed private get curPage() { return FieldValue(this.Document.curPage, -1); }


    _loaded: boolean = false;

    @action
    setScaling = (r: any) => {
        if (this._loaded) {
            // bcz: the nativeHeight should really be set when the document is imported.
            //      also, the native dimensions could be different for different pages of the PDF
            //      so this design is flawed.
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

    get player(): HTMLVideoElement | undefined {
        return this._videoRef.current ? this._videoRef.current.getElementsByTagName("video")[0] : undefined;
    }

    @action
    setVideoRef = (vref: HTMLVideoElement | null) => {
        if (this.curPage >= 0 && vref) {
            vref.currentTime = this.curPage;
            (vref as any).AHackBecauseSomethingResetsTheVideoToZero = this.curPage;
        }
    }

    render() {
        let field = FieldValue(Cast(this.Document[this.props.fieldKey], VideoField));
        if (!field) {
            return <div>Loading</div>;
        }
        let path = field.url.href;
        return (
            <Measure onResize={this.setScaling}>
                {({ measureRef }) =>
                    <div style={{ width: "100%", height: "auto" }} ref={measureRef}>
                        <video className="videobox-cont" ref={this.setVideoRef}>
                            <source src={path} type="video/mp4" />
                            Not supported.
                        </video>
                    </div>
                }
            </Measure>
        );
    }
}