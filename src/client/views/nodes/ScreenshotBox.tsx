import React = require("react");
import { library } from "@fortawesome/fontawesome-svg-core";
import { faVideo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as rp from 'request-promise';
import { documentSchema, positionSchema } from "../../../new_fields/documentSchemas";
import { makeInterface } from "../../../new_fields/Schema";
import { ScriptField } from "../../../new_fields/ScriptField";
import { Cast, StrCast } from "../../../new_fields/Types";
import { VideoField } from "../../../new_fields/URLField";
import { emptyFunction, returnFalse, returnOne, Utils, returnZero } from "../../../Utils";
import { Docs, DocUtils } from "../../documents/Documents";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { DocAnnotatableComponent } from "../DocComponent";
import { InkingControl } from "../InkingControl";
import { FieldView, FieldViewProps } from './FieldView';
import "./ScreenshotBox.scss";
const path = require('path');

type ScreenshotDocument = makeInterface<[typeof documentSchema, typeof positionSchema]>;
const ScreenshotDocument = makeInterface(documentSchema, positionSchema);

library.add(faVideo);

@observer
export class ScreenshotBox extends DocAnnotatableComponent<FieldViewProps, ScreenshotDocument>(ScreenshotDocument) {
    private _reactionDisposer?: IReactionDisposer;
    private _videoRef: HTMLVideoElement | null = null;
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(ScreenshotBox, fieldKey); }

    public get player(): HTMLVideoElement | null {
        return this._videoRef;
    }

    videoLoad = () => {
        const aspect = this.player!.videoWidth / this.player!.videoHeight;
        const nativeWidth = (this.Document._nativeWidth || 0);
        const nativeHeight = (this.Document._nativeHeight || 0);
        if (!nativeWidth || !nativeHeight) {
            if (!this.Document._nativeWidth) this.Document._nativeWidth = 400;
            this.Document._nativeHeight = (this.Document._nativeWidth || 0) / aspect;
            this.Document._height = (this.Document._width || 0) / aspect;
        }
    }

    @action public Snapshot() {
        const width = this.Document._width || 0;
        const height = this.Document._height || 0;
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 640 * (this.Document._nativeHeight || 0) / (this.Document._nativeWidth || 1);
        const ctx = canvas.getContext('2d');//draw image to canvas. scale to target dimensions
        if (ctx) {
            ctx.rect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "blue";
            ctx.fill();
            this._videoRef && ctx.drawImage(this._videoRef, 0, 0, canvas.width, canvas.height);
        }

        if (this._videoRef) {
            //convert to desired file format
            const dataUrl = canvas.toDataURL('image/png'); // can also use 'image/png'
            // if you want to preview the captured image,
            const filename = path.basename(encodeURIComponent("screenshot" + Utils.GenerateGuid().replace(/\..*$/, "").replace(" ", "_")));
            ScreenshotBox.convertDataUri(dataUrl, filename).then(returnedFilename => {
                setTimeout(() => {
                    if (returnedFilename) {
                        const imageSummary = Docs.Create.ImageDocument(Utils.prepend(returnedFilename), {
                            x: (this.Document.x || 0) + width, y: (this.Document.y || 0),
                            _width: 150, _height: height / width * 150, title: "--screenshot--"
                        });
                        this.props.addDocument?.(imageSummary);
                    }
                }, 500);
            });
        }
    }

    componentDidMount() {
    }

    componentWillUnmount() {
        this._reactionDisposer && this._reactionDisposer();
    }

    @action
    setVideoRef = (vref: HTMLVideoElement | null) => {
        this._videoRef = vref;
    }

    public static async convertDataUri(imageUri: string, returnedFilename: string) {
        try {
            const posting = Utils.prepend("/uploadURI");
            const returnedUri = await rp.post(posting, {
                body: {
                    uri: imageUri,
                    name: returnedFilename
                },
                json: true,
            });
            return returnedUri;

        } catch (e) {
            console.log(e);
        }
    }
    @observable _screenCapture = false;
    specificContextMenu = (e: React.MouseEvent): void => {
        const field = Cast(this.dataDoc[this.props.fieldKey], VideoField);
        if (field) {
            const url = field.url.href;
            const subitems: ContextMenuProps[] = [];
            subitems.push({ description: "Take Snapshot", event: () => this.Snapshot(), icon: "expand-arrows-alt" });
            subitems.push({
                description: "Screen Capture", event: (async () => {
                    runInAction(() => this._screenCapture = !this._screenCapture);
                    this._videoRef!.srcObject = !this._screenCapture ? undefined : await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
                }), icon: "expand-arrows-alt"
            });
            ContextMenu.Instance.addItem({ description: "Screenshot Funcs...", subitems: subitems, icon: "video" });
        }
    }

    @computed get content() {
        const interactive = InkingControl.Instance.selectedTool || !this.props.isSelected() ? "" : "-interactive";
        const style = "videoBox-content" + interactive;
        return <video className={`${style}`} key="video" autoPlay={this._screenCapture} ref={this.setVideoRef}
            style={{ width: this._screenCapture ? "100%" : undefined, height: this._screenCapture ? "100%" : undefined }}
            onCanPlay={this.videoLoad}
            controls={true}
            onClick={e => e.preventDefault()}>
            <source type="video/mp4" />
            Not supported.
            </video>;
    }

    toggleRecording = action(async () => {
        this._screenCapture = !this._screenCapture;
        this._videoRef!.srcObject = !this._screenCapture ? undefined : await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
    });

    private get uIButtons() {
        return (<div className="screenshotBox-uiButtons">
            <div className="screenshotBox-recorder" key="snap" onPointerDown={this.toggleRecording} >
                <FontAwesomeIcon icon="file" size="lg" />
            </div>,
            <div className="screenshotBox-snapshot" key="snap" onPointerDown={this.onSnapshot} >
                <FontAwesomeIcon icon="camera" size="lg" />
            </div>
        </div>);
    }

    onSnapshot = (e: React.PointerEvent) => {
        this.Snapshot();
        e.stopPropagation();
        e.preventDefault();
    }


    contentFunc = () => [this.content];
    render() {
        return (<div className="videoBox" onContextMenu={this.specificContextMenu}
            style={{ transform: `scale(${this.props.ContentScaling()})`, width: `${100 / this.props.ContentScaling()}%`, height: `${100 / this.props.ContentScaling()}%` }} >
            <div className="videoBox-viewer" >
                <CollectionFreeFormView {...this.props}
                    PanelHeight={this.props.PanelHeight}
                    PanelWidth={this.props.PanelWidth}
                    NativeHeight={returnZero}
                    NativeWidth={returnZero}
                    annotationsKey={this.annotationKey}
                    focus={this.props.focus}
                    isSelected={this.props.isSelected}
                    isAnnotationOverlay={true}
                    select={emptyFunction}
                    active={this.annotationsActive}
                    ContentScaling={returnOne}
                    whenActiveChanged={this.whenActiveChanged}
                    removeDocument={this.removeDocument}
                    moveDocument={this.moveDocument}
                    addDocument={returnFalse}
                    CollectionView={undefined}
                    ScreenToLocalTransform={this.props.ScreenToLocalTransform}
                    renderDepth={this.props.renderDepth + 1}
                    ContainingCollectionDoc={this.props.ContainingCollectionDoc}>
                    {this.contentFunc}
                </CollectionFreeFormView>
            </div>
            {this.active() ? this.uIButtons : (null)}
        </div >);
    }
}