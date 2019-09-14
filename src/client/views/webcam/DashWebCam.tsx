import React = require("react");
import { observer } from "mobx-react";
import { FieldViewProps, FieldView } from "../nodes/FieldView";
import { observable } from "mobx";
import { DocumentDecorations } from "../DocumentDecorations";
import { InkingControl } from "../InkingControl";
import { CollectionFreeFormDocumentViewProps } from "../nodes/CollectionFreeFormDocumentView";



function hasGetUserMedia() {
    return !!(
        (navigator.mediaDevices && navigator.mediaDevices.getUserMedia));
}

interface WebcamProps {
    audio: boolean;
    audioConstraints?: MediaStreamConstraints["audio"];
    imageSmoothing: boolean;
    minScreenshotHeight?: number;
    minScreenshotWidth?: number;
    onUserMedia: () => void;
    onUserMediaError: (error: string) => void;
    screenshotFormat: "image/webp" | "image/png" | "image/jpeg";
    screenshotQuality: number;
    videoConstraints?: MediaStreamConstraints["video"];
}

@observer
export class DashWebCam extends React.Component<CollectionFreeFormDocumentViewProps & FieldViewProps & WebcamProps & React.HTMLAttributes<HTMLVideoElement> & {
    layoutKey: string,
}> {
    static defaultProps = {
        audio: true,
        imageSmoothing: true,
        onUserMedia: () => { },
        onUserMediaError: () => { },
        screenshotFormat: "image/webp",
        screenshotQuality: 0.92
    };

    private static mountedInstances: DashWebCam[] = [];
    private static userMediaRequested = false;
    private canvas: HTMLCanvasElement | undefined;
    private ctx: CanvasRenderingContext2D | null = null;
    private stream: MediaStream | undefined;
    private video: HTMLVideoElement | null | undefined;

    @observable private hasUserMedia: boolean | undefined;
    @observable private src: string | undefined;

    // constructor(props: any) {
    //     super(props);
    //     this.state = {
    //         hasUserMedia: false
    //     };
    // }

    componentDidMount() {
        if (!hasGetUserMedia()) return;

        // const { state } = this;

        DashWebCam.mountedInstances.push(this);

        if (!this.hasUserMedia && !DashWebCam.userMediaRequested) {
            this.requestUserMedia();
        }
    }

    componentDidUpdate(nextProps: WebcamProps) {
        const { props } = this;
        if (
            JSON.stringify(nextProps.audioConstraints) !==
            JSON.stringify(props.audioConstraints) ||
            JSON.stringify(nextProps.videoConstraints) !==
            JSON.stringify(props.videoConstraints)
        ) {
            this.requestUserMedia();
        }
    }

    componentWillUnmount() {
        //const { state } = this;
        const index = DashWebCam.mountedInstances.indexOf(this);
        DashWebCam.mountedInstances.splice(index, 1);

        DashWebCam.userMediaRequested = false;
        if (DashWebCam.mountedInstances.length === 0 && this.hasUserMedia) {
            if (this.stream!.getVideoTracks && this.stream!.getAudioTracks) {
                this.stream!.getVideoTracks().map(track => track.stop());
                this.stream!.getAudioTracks().map(track => track.stop());
            } else {
                ((this.stream as unknown) as MediaStreamTrack).stop();
            }

            if (this.src) {
                window.URL.revokeObjectURL(this.src);
            }
        }
    }

    getScreenshot() {
        const { props } = this;

        if (!this.hasUserMedia) return null;

        const canvas = this.getCanvas();
        return (
            canvas &&
            canvas.toDataURL(props.screenshotFormat, props.screenshotQuality)
        );
    }

    getCanvas() {
        const { props } = this;

        if (!this.video) {
            return null;
        }

        if (!this.hasUserMedia || !this.video.videoHeight) return null;

        if (!this.ctx) {
            const canvas = document.createElement("canvas");
            const aspectRatio = this.video.videoWidth / this.video.videoHeight;

            let canvasWidth = props.minScreenshotWidth || this.video.clientWidth;
            let canvasHeight = canvasWidth / aspectRatio;

            if (
                props.minScreenshotHeight &&
                canvasHeight < props.minScreenshotHeight
            ) {
                canvasHeight = props.minScreenshotHeight;
                canvasWidth = canvasHeight * aspectRatio;
            }

            canvas.width = canvasWidth;
            canvas.height = canvasHeight;

            this.canvas = canvas;
            this.ctx = canvas.getContext("2d");
        }

        const { ctx, canvas } = this;

        if (ctx) {
            ctx.imageSmoothingEnabled = props.imageSmoothing;
            ctx.drawImage(this.video, 0, 0, canvas!.width, canvas!.height);
        }

        return canvas;
    }

    requestUserMedia() {
        const { props } = this;

        navigator.getUserMedia =
            navigator.mediaDevices.getUserMedia;

        const sourceSelected = (audioConstraints: any, videoConstraints: any) => {
            const constraints: MediaStreamConstraints = {
                video: typeof videoConstraints !== "undefined" ? videoConstraints : true
            };

            if (props.audio) {
                constraints.audio =
                    typeof audioConstraints !== "undefined" ? audioConstraints : true;
            }

            navigator.mediaDevices
                .getUserMedia(constraints)
                .then(stream => {
                    DashWebCam.mountedInstances.forEach(instance =>
                        instance.handleUserMedia(null, stream)
                    );
                })
                .catch(e => {
                    DashWebCam.mountedInstances.forEach(instance =>
                        instance.handleUserMedia(e)
                    );
                });
        };

        if ("mediaDevices" in navigator) {
            sourceSelected(props.audioConstraints, props.videoConstraints);
        } else {
            const optionalSource = (id: any) => ({ optional: [{ sourceId: id }] });

            const constraintToSourceId = (constraint: any) => {
                const { deviceId } = constraint;

                if (typeof deviceId === "string") {
                    return deviceId;
                }

                if (Array.isArray(deviceId) && deviceId.length > 0) {
                    return deviceId[0];
                }

                if (typeof deviceId === "object" && deviceId.ideal) {
                    return deviceId.ideal;
                }

                return null;
            };

            // @ts-ignore: deprecated api
            MediaStreamTrack.getSources(sources => {
                let audioSource = null;
                let videoSource = null;

                sources.forEach((source: { kind: string; id: any; }) => {
                    if (source.kind === "audio") {
                        audioSource = source.id;
                    } else if (source.kind === "video") {
                        videoSource = source.id;
                    }
                });

                const audioSourceId = constraintToSourceId(props.audioConstraints);
                if (audioSourceId) {
                    audioSource = audioSourceId;
                }

                const videoSourceId = constraintToSourceId(props.videoConstraints);
                if (videoSourceId) {
                    videoSource = videoSourceId;
                }

                sourceSelected(
                    optionalSource(audioSource),
                    optionalSource(videoSource)
                );
            });
        }

        DashWebCam.userMediaRequested = true;
    }

    handleUserMedia(err: string | null, stream?: MediaStream) {
        const { props } = this;

        if (err || !stream) {
            this.setState({ hasUserMedia: false });
            props.onUserMediaError(err!);

            return;
        }

        this.stream = stream;

        try {
            if (this.video) {
                this.video.srcObject = stream;
            }
            this.setState({ hasUserMedia: true });
        } catch (error) {
            this.setState({
                hasUserMedia: true,
                src: window.URL.createObjectURL(stream)
            });
        }

        props.onUserMedia();
    }

    _ignore = 0;
    onPreWheel = (e: React.WheelEvent) => {
        this._ignore = e.timeStamp;
    }
    onPrePointer = (e: React.PointerEvent) => {
        this._ignore = e.timeStamp;
    }
    onPostPointer = (e: React.PointerEvent) => {
        if (this._ignore !== e.timeStamp) {
            e.stopPropagation();
        }
    }
    onPostWheel = (e: React.WheelEvent) => {
        if (this._ignore !== e.timeStamp) {
            e.stopPropagation();
        }
    }




    public static LayoutString() { return FieldView.LayoutString(DashWebCam); }


    render() {
        const { props } = this;



        const {
            audio,
            onUserMedia,
            onUserMediaError,
            screenshotFormat,
            screenshotQuality,
            minScreenshotWidth,
            minScreenshotHeight,
            audioConstraints,
            videoConstraints,
            imageSmoothing,
            fieldKey,
            fieldExt,
            leaveNativeSize,
            fitToBox,
            ContainingCollectionView,
            Document,
            DataDoc,
            onClick,
            isSelected,
            select,
            renderDepth,
            addDocument,
            addDocTab,
            pinToPres,
            removeDocument,
            moveDocument,
            ScreenToLocalTransform,
            active,
            whenActiveChanged,
            focus,
            PanelWidth,
            PanelHeight,
            setVideoBox,
            setPdfBox,
            ContentScaling,
            ChromeHeight,
            jitterRotation,
            backgroundColor,
            bringToFront,
            zoomToScale,
            getScale,
            animateBetweenIcon,
            layoutKey,
            ...rest
        } = props;


        let content =
            <div className="webcam-cont" style={{ position: "absolute" }} onWheel={this.onPostWheel} onPointerDown={this.onPostPointer} onPointerMove={this.onPostPointer} onPointerUp={this.onPostPointer}>
                <video
                    autoPlay
                    src={this.src}
                    muted={audio}
                    playsInline
                    ref={ref => {
                        this.video = ref;
                    }}
                    {...rest}
                />
            </div>;


        let frozen = !this.props.isSelected() || DocumentDecorations.Instance.Interacting;
        let classname = "webBox-cont" + (this.props.isSelected() && !InkingControl.Instance.selectedTool && !DocumentDecorations.Instance.Interacting ? "-interactive" : "");

        return (
            <>
                <div className={classname}  >
                    {content}
                </div>
                {!frozen ? (null) : <div className="webBox-overlay" onWheel={this.onPreWheel} onPointerDown={this.onPrePointer} onPointerMove={this.onPrePointer} onPointerUp={this.onPrePointer} />}
            </>);

    }
}