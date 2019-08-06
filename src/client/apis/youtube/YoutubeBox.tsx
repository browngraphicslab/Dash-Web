import { action, observable, runInAction } from 'mobx';
import { observer } from "mobx-react";
import { Doc, DocListCastAsync } from "../../../new_fields/Doc";
import { Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { Utils } from "../../../Utils";
import { DocServer } from "../../DocServer";
import { Docs } from "../../documents/Documents";
import { DocumentDecorations } from "../../views/DocumentDecorations";
import { InkingControl } from "../../views/InkingControl";
import { FieldView, FieldViewProps } from "../../views/nodes/FieldView";
import "../../views/nodes/WebBox.scss";
import "./YoutubeBox.scss";
import React = require("react");

interface VideoTemplate {
    thumbnailUrl: string;
    videoTitle: string;
    videoId: string;
    duration: string;
    channelTitle: string;
    viewCount: string;
    publishDate: string;
    videoDescription: string;
}

/**
 * This class models the youtube search document that can be dropped on to canvas.
 */
@observer
export class YoutubeBox extends React.Component<FieldViewProps> {

    @observable YoutubeSearchElement: HTMLInputElement | undefined;
    @observable searchResultsFound: boolean = false;
    @observable searchResults: any[] = [];
    @observable videoClicked: boolean = false;
    @observable selectedVideoUrl: string = "";
    @observable lisOfBackUp: JSX.Element[] = [];
    @observable videoIds: string | undefined;
    @observable videoDetails: any[] = [];
    @observable curVideoTemplates: VideoTemplate[] = [];


    public static LayoutString() { return FieldView.LayoutString(YoutubeBox); }

    /**
     * When component mounts, last search's results are laoded in based on the back up stored
     * in the document of the props.
     */
    async componentWillMount() {
        //DocServer.getYoutubeChannels();
        let castedSearchBackUp = Cast(this.props.Document.cachedSearchResults, Doc);
        let awaitedBackUp = await castedSearchBackUp;
        let castedDetailBackUp = Cast(this.props.Document.cachedDetails, Doc);
        let awaitedDetails = await castedDetailBackUp;


        if (awaitedBackUp) {


            let jsonList = await DocListCastAsync(awaitedBackUp.json);
            let jsonDetailList = await DocListCastAsync(awaitedDetails!.json);

            if (jsonList!.length !== 0) {
                runInAction(() => this.searchResultsFound = true);
                let index = 0;
                //getting the necessary information from backUps and building templates that will be used to map in render
                for (let video of jsonList!) {

                    let videoId = await Cast(video.id, Doc);
                    let id = StrCast(videoId!.videoId);
                    let snippet = await Cast(video.snippet, Doc);
                    let videoTitle = this.filterYoutubeTitleResult(StrCast(snippet!.title));
                    let thumbnail = await Cast(snippet!.thumbnails, Doc);
                    let thumbnailMedium = await Cast(thumbnail!.medium, Doc);
                    let thumbnailUrl = StrCast(thumbnailMedium!.url);
                    let videoDescription = StrCast(snippet!.description);
                    let pusblishDate = (this.roundPublishTime(StrCast(snippet!.publishedAt)))!;
                    let channelTitle = StrCast(snippet!.channelTitle);
                    let duration: string = "";
                    let viewCount: string = "";
                    if (jsonDetailList!.length !== 0) {
                        let contentDetails = await Cast(jsonDetailList![index].contentDetails, Doc);
                        let statistics = await Cast(jsonDetailList![index].statistics, Doc);
                        duration = this.convertIsoTimeToDuration(StrCast(contentDetails!.duration));
                        viewCount = this.abbreviateViewCount(parseInt(StrCast(statistics!.viewCount)))!;
                    }
                    index = index + 1;
                    let newTemplate: VideoTemplate = { videoId: id, videoTitle: videoTitle, thumbnailUrl: thumbnailUrl, publishDate: pusblishDate, channelTitle: channelTitle, videoDescription: videoDescription, duration: duration, viewCount: viewCount };
                    runInAction(() => this.curVideoTemplates.push(newTemplate));
                }
            }
        }
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

    /**
     * Function that submits the title entered by user on enter press.
     */
    onEnterKeyDown = (e: React.KeyboardEvent) => {
        if (e.keyCode === 13) {
            let submittedTitle = this.YoutubeSearchElement!.value;
            this.YoutubeSearchElement!.value = "";
            this.YoutubeSearchElement!.blur();
            DocServer.getYoutubeVideos(submittedTitle, this.processesVideoResults);

        }
    }

    /**
     * The callback that is passed in to server, which functions as a way to
     * get videos that is returned by search. It also makes a call to server
     * to get details for the videos found.
     */
    @action
    processesVideoResults = (videos: any[]) => {
        this.searchResults = videos;
        if (this.searchResults.length > 0) {
            this.searchResultsFound = true;
            this.videoIds = "";
            videos.forEach((video) => {
                if (this.videoIds === "") {
                    this.videoIds = video.id.videoId;
                } else {
                    this.videoIds = this.videoIds! + ", " + video.id.videoId;
                }
            });
            //Asking for details that include duration and viewCount from server for videoIds
            DocServer.getYoutubeVideoDetails(this.videoIds, this.processVideoDetails);
            this.backUpSearchResults(videos);
            if (this.videoClicked) {
                this.videoClicked = false;
            }
        }
    }

    /**
     * The callback that is given to server to process and receive returned details about the videos.
     */
    @action
    processVideoDetails = (videoDetails: any[]) => {
        this.videoDetails = videoDetails;
        this.props.Document.cachedDetails = Docs.Get.DocumentHierarchyFromJson(videoDetails, "detailBackUp");
    }

    /**
     * The function that stores the search results in the props document.
     */
    backUpSearchResults = (videos: any[]) => {
        this.props.Document.cachedSearchResults = Docs.Get.DocumentHierarchyFromJson(videos, "videosBackUp");
    }

    /**
     * The function that filters out escaped characters returned by the api
     * in the title of the videos.
     */
    filterYoutubeTitleResult = (resultTitle: string) => {
        let processedTitle: string = resultTitle.ReplaceAll("&amp;", "&");
        processedTitle = processedTitle.ReplaceAll("&#39;", "'");
        processedTitle = processedTitle.ReplaceAll("&quot;", "\"");
        return processedTitle;
    }



    /**
     * The function that converts ISO date, which is passed in, to normal date and finds the
     * difference between today's date and that date, in terms of "ago" to imitate youtube.
     */
    roundPublishTime = (publishTime: string) => {
        let date = new Date(publishTime).getTime();
        let curDate = new Date().getTime();
        let timeDif = curDate - date;
        let totalSeconds = timeDif / 1000;
        let totalMin = totalSeconds / 60;
        let totalHours = totalMin / 60;
        let totalDays = totalHours / 24;
        let totalMonths = totalDays / 30.417;
        let totalYears = totalMonths / 12;


        let truncYears = Math.trunc(totalYears);
        let truncMonths = Math.trunc(totalMonths);
        let truncDays = Math.trunc(totalDays);
        let truncHours = Math.trunc(totalHours);
        let truncMin = Math.trunc(totalMin);
        let truncSec = Math.trunc(totalSeconds);

        let pluralCase = "";

        if (truncYears !== 0) {
            truncYears > 1 ? pluralCase = "s" : pluralCase = "";
            return truncYears + " year" + pluralCase + " ago";
        } else if (truncMonths !== 0) {
            truncMonths > 1 ? pluralCase = "s" : pluralCase = "";
            return truncMonths + " month" + pluralCase + " ago";
        } else if (truncDays !== 0) {
            truncDays > 1 ? pluralCase = "s" : pluralCase = "";
            return truncDays + " day" + pluralCase + " ago";
        } else if (truncHours !== 0) {
            truncHours > 1 ? pluralCase = "s" : pluralCase = "";
            return truncHours + " hour" + pluralCase + " ago";
        } else if (truncMin !== 0) {
            truncMin > 1 ? pluralCase = "s" : pluralCase = "";
            return truncMin + " minute" + pluralCase + " ago";
        } else if (truncSec !== 0) {
            truncSec > 1 ? pluralCase = "s" : pluralCase = "";
            return truncSec + " second" + pluralCase + " ago";
        }
    }

    /**
     * The function that converts the passed in ISO time to normal duration time.
     */
    convertIsoTimeToDuration = (isoDur: string) => {

        let convertedTime = isoDur.replace(/D|H|M/g, ":").replace(/P|T|S/g, "").split(":");

        if (1 === convertedTime.length) {
            2 !== convertedTime[0].length && (convertedTime[0] = "0" + convertedTime[0]), convertedTime[0] = "0:" + convertedTime[0];
        } else {
            for (var r = 1, l = convertedTime.length - 1; l >= r; r++) {
                2 !== convertedTime[r].length && (convertedTime[r] = "0" + convertedTime[r]);
            }
        }

        return convertedTime.join(":");
    }

    /**
     * The function that rounds the viewCount to the nearest 
     * thousand, million or billion, given a viewCount number.
     */
    abbreviateViewCount = (viewCount: number) => {
        if (viewCount < 1000) {
            return viewCount.toString();
        } else if (viewCount >= 1000 && viewCount < 1000000) {
            return (Math.trunc(viewCount / 1000)) + "K";
        } else if (viewCount >= 1000000 && viewCount < 1000000000) {
            return (Math.trunc(viewCount / 1000000)) + "M";
        } else if (viewCount >= 1000000000) {
            return (Math.trunc(viewCount / 1000000000)) + "B";
        }
    }

    /**
     * The function that is called to decide on what'll be rendered by the component.
     * It renders search Results if found. If user didn't do a new search, it renders from the videoTemplates
     * generated by the backUps. If none present, renders nothing.
     */
    renderSearchResultsOrVideo = () => {
        if (this.searchResultsFound) {
            if (this.searchResults.length !== 0) {
                return <ul>
                    {this.searchResults.map((video, index) => {
                        let filteredTitle = this.filterYoutubeTitleResult(video.snippet.title);
                        let channelTitle = video.snippet.channelTitle;
                        let videoDescription = video.snippet.description;
                        let pusblishDate = this.roundPublishTime(video.snippet.publishedAt);
                        let duration;
                        let viewCount;
                        if (this.videoDetails.length !== 0) {
                            duration = this.convertIsoTimeToDuration(this.videoDetails[index].contentDetails.duration);
                            viewCount = this.abbreviateViewCount(this.videoDetails[index].statistics.viewCount);
                        }


                        return <li onClick={() => this.embedVideoOnClick(video.id.videoId, filteredTitle)} key={Utils.GenerateGuid()}>
                            <div className="search_wrapper">
                                <div style={{ backgroundColor: "yellow" }}>
                                    <img src={video.snippet.thumbnails.medium.url} />
                                    <span className="video_duration">{duration}</span>
                                </div>
                                <div className="textual_info">
                                    <span className="videoTitle">{filteredTitle}</span>
                                    <span className="channelName">{channelTitle}</span>
                                    <span className="viewCount">{viewCount}</span>
                                    <span className="publish_time">{pusblishDate}</span>
                                    <p className="video_description">{videoDescription}</p>

                                </div>
                            </div>
                        </li>;
                    })}
                </ul>;
            } else if (this.curVideoTemplates.length !== 0) {
                return <ul>
                    {this.curVideoTemplates.map((video: VideoTemplate) => {
                        return <li onClick={() => this.embedVideoOnClick(video.videoId, video.videoTitle)} key={Utils.GenerateGuid()}>
                            <div className="search_wrapper">
                                <div style={{ backgroundColor: "yellow" }}>
                                    <img src={video.thumbnailUrl} />
                                    <span className="video_duration">{video.duration}</span>
                                </div>
                                <div className="textual_info">
                                    <span className="videoTitle">{video.videoTitle}</span>
                                    <span className="channelName">{video.channelTitle}</span>
                                    <span className="viewCount">{video.viewCount}</span>
                                    <span className="publish_time">{video.publishDate}</span>
                                    <p className="video_description">{video.videoDescription}</p>
                                </div>
                            </div>
                        </li>;
                    })}
                </ul>;
            }
        } else {
            return (null);
        }
    }

    /**
     * Given a videoId and title, creates a new youtube embedded url, and uses that
     * to create a new video document.
     */
    @action
    embedVideoOnClick = (videoId: string, filteredTitle: string) => {
        let embeddedUrl = "https://www.youtube.com/embed/" + videoId;
        this.selectedVideoUrl = embeddedUrl;
        let addFunction = this.props.addDocument!;
        let newVideoX = NumCast(this.props.Document.x);
        let newVideoY = NumCast(this.props.Document.y) + NumCast(this.props.Document.height);

        addFunction(Docs.Create.VideoDocument(embeddedUrl, { title: filteredTitle, width: 400, height: 315, x: newVideoX, y: newVideoY }));
        this.videoClicked = true;
    }

    render() {
        let content =
            <div className="youtubeBox-cont" style={{ width: "100%", height: "100%", position: "absolute" }} onWheel={this.onPostWheel} onPointerDown={this.onPostPointer} onPointerMove={this.onPostPointer} onPointerUp={this.onPostPointer}>
                <input type="text" placeholder="Search for a video" onKeyDown={this.onEnterKeyDown} style={{ height: 40, width: "100%", border: "1px solid black", padding: 5, textAlign: "center" }} ref={(e) => this.YoutubeSearchElement = e!} />
                {this.renderSearchResultsOrVideo()}
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