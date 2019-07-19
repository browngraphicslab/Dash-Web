import "../../views/nodes/WebBox.scss";
import React = require("react");
import { FieldViewProps, FieldView } from "../../views/nodes/FieldView";
import { HtmlField } from "../../../new_fields/HtmlField";
import { WebField } from "../../../new_fields/URLField";
import { observer } from "mobx-react";
import { computed, reaction, IReactionDisposer, observable, action, runInAction } from 'mobx';
import { DocumentDecorations } from "../../views/DocumentDecorations";
import { InkingControl } from "../../views/InkingControl";
import { Utils } from "../../../Utils";
import { DocServer } from "../../DocServer";
import { NumCast, Cast, StrCast } from "../../../new_fields/Types";
import "./YoutubeBox.scss";
import { Docs } from "../../documents/Documents";
import { Doc } from "../../../new_fields/Doc";
import { listSpec } from "../../../new_fields/Schema";
import { List } from "../../../new_fields/List";


@observer
export class YoutubeBox extends React.Component<FieldViewProps> {

    @observable YoutubeSearchElement: HTMLInputElement | undefined;
    @observable searchResultsFound: boolean = false;
    @observable searchResults: any[] = [];
    @observable videoClicked: boolean = false;
    @observable selectedVideoUrl: string = "";
    @observable lisOfBackUp: JSX.Element[] = [];


    public static LayoutString() { return FieldView.LayoutString(YoutubeBox); }

    async componentWillMount() {
        //DocServer.getYoutubeChannels();
        let castedBackUpDocs = Cast(this.props.Document.cachedSearch, listSpec(Doc));
        if (!castedBackUpDocs) {
            this.props.Document.cachedSearch = castedBackUpDocs = new List<Doc>();
        }
        if (castedBackUpDocs.length !== 0) {

            this.searchResultsFound = true;

            for (let videoBackUp of castedBackUpDocs) {
                let curBackUp = await videoBackUp;
                let videoId = StrCast(curBackUp.videoId);
                let videoTitle = StrCast(curBackUp.videoTitle);
                let thumbnailUrl = StrCast(curBackUp.thumbnailUrl);
                runInAction(() => this.lisOfBackUp.push((
                    <li
                        onClick={() => this.embedVideoOnClick(videoId, videoTitle)}
                        key={Utils.GenerateGuid()}
                    >
                        <img src={thumbnailUrl} />
                        <span className="videoTitle">{videoTitle}</span>
                    </li>)
                ));
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

    onEnterKeyDown = (e: React.KeyboardEvent) => {
        if (e.keyCode === 13) {
            let submittedTitle = this.YoutubeSearchElement!.value;
            this.YoutubeSearchElement!.value = "";
            this.YoutubeSearchElement!.blur();
            DocServer.getYoutubeVideos(submittedTitle, this.processesVideoResults);

        }
    }

    @action
    processesVideoResults = (videos: any[]) => {
        this.searchResults = videos;
        if (this.searchResults.length > 0) {
            this.searchResultsFound = true;
            this.backUpSearchResults(videos);
            if (this.videoClicked) {
                this.videoClicked = false;
            }
        }
    }

    backUpSearchResults = (videos: any[]) => {
        let newCachedList = new List<Doc>();
        this.props.Document.cachedSearch = newCachedList;
        videos.forEach((video) => {
            let videoBackUp = new Doc();
            videoBackUp.videoId = video.id.videoId;
            videoBackUp.videoTitle = this.filterYoutubeTitleResult(video.snippet.title);
            videoBackUp.thumbnailUrl = video.snippet.thumbnails.medium.url;
            newCachedList.push(videoBackUp);
        });
    }

    filterYoutubeTitleResult = (resultTitle: string) => {
        let processedTitle: string = resultTitle.ReplaceAll("&amp;", "&");
        processedTitle = processedTitle.ReplaceAll("&#39;", "'");
        processedTitle = processedTitle.ReplaceAll("&quot;", "\"");
        return processedTitle;
    }

    roundPublishTime = (publishTime: string) => {
        let date = new Date(publishTime);
        let curDate = new Date();
        let videoYearDif = curDate.getFullYear() - date.getFullYear();
        let videoMonthDif = curDate.getMonth() - date.getMonth();
        let videoDayDif = curDate.getDay() - date.getDay();
        console.log("video day dif: ", videoDayDif, " first day: ", curDate.getDay(), " second day: ", date.getDay());
        let videoHoursDif = curDate.getHours() - date.getHours();
        let videoMinutesDif = curDate.getMinutes() - date.getMinutes();
        let videoSecondsDif = curDate.getSeconds() - date.getSeconds();
        if (videoYearDif !== 0) {
            return videoYearDif + " years ago";
        } else if (videoMonthDif !== 0) {
            return videoMonthDif + " months ago";
        } else if (videoDayDif !== 0) {
            return videoDayDif + " days ago";
        } else if (videoHoursDif !== 0) {
            return videoHoursDif + " hours ago";
        } else if (videoMinutesDif) {
            return videoMinutesDif + " minutes ago";
        } else if (videoSecondsDif) {
            return videoSecondsDif + " seconds ago";
        }

        console.log("Date : ", date);
    }

    roundPublishTime2 = (publishTime: string) => {
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

    renderSearchResultsOrVideo = () => {
        if (this.searchResultsFound) {
            if (this.searchResults.length !== 0) {
                return <ul>
                    {this.searchResults.map((video) => {
                        let filteredTitle = this.filterYoutubeTitleResult(video.snippet.title);
                        let channelTitle = video.snippet.channelTitle;
                        let videoDescription = video.snippet.description;
                        let pusblishDate = this.roundPublishTime2(video.snippet.publishedAt);
                        // let duration = video.contentDetails.duration;
                        //let viewCount = video.statistics.viewCount;
                        //this.roundPublishTime(pusblishDate);
                        //this.roundPublishTime2(video.snippet.publishedAt);
                        return <li onClick={() => this.embedVideoOnClick(video.id.videoId, filteredTitle)} key={Utils.GenerateGuid()}>
                            <div className="search_wrapper">
                                <img src={video.snippet.thumbnails.medium.url} />
                                <div className="textual_info">
                                    <span className="videoTitle">{filteredTitle}</span>
                                    <span className="channelName">{channelTitle}</span>
                                    <span className="publish_time">{pusblishDate}</span>
                                    {/* <h6 className="viewCount">{viewCount}</h6> */}
                                    <p className="video_description">{videoDescription}</p>
                                </div>
                            </div>
                        </li>;
                    })}
                </ul>;
            } else if (this.lisOfBackUp.length !== 0) {
                return <ul>{this.lisOfBackUp}</ul>;
            }
        } else {
            return (null);
        }
    }

    @action
    embedVideoOnClick = (videoId: string, filteredTitle: string) => {
        let embeddedUrl = "https://www.youtube.com/embed/" + videoId;
        console.log("EmbeddedUrl: ", embeddedUrl);
        this.selectedVideoUrl = embeddedUrl;
        let addFunction = this.props.addDocument!;
        let newVideoX = NumCast(this.props.Document.x);
        let newVideoY = NumCast(this.props.Document.y) + NumCast(this.props.Document.height);

        addFunction(Docs.Create.VideoDocument(embeddedUrl, { title: filteredTitle, width: 400, height: 315, x: newVideoX, y: newVideoY }));
        this.videoClicked = true;
    }

    render() {
        let field = this.props.Document[this.props.fieldKey];
        let content =
            <div style={{ width: "100%", height: "100%", position: "absolute" }} onWheel={this.onPostWheel} onPointerDown={this.onPostPointer} onPointerMove={this.onPostPointer} onPointerUp={this.onPostPointer}>
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