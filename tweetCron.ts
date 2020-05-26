import { OdnTweetData, OdnTweets } from '../../../odnTweets';
import { OdnPlugins, OdnPluginResultData } from '../../../odnPlugins';
import { Log, OdnUtils } from '../../../odnUtils';
import {
  TweetCron as Batch,
  TweetCronSchedule
} from '../../batch/tweetCron/tweetCron';

export class TweetCron {
  private static command: RegExp;

  constructor(private tweetData: OdnTweetData, private fullName: string) {}

  /**
   * プラグインのメイン処理を実行
   *
   * @param {(isProcessed?: boolean) => void} finish
   */
  run(finish: (isProcessed?: boolean) => void) {
    if (TweetCron.isValidAddAction(this.tweetData)) {
      this.addSchedule(finish);
    } else if (TweetCron.isValidRemoveAction(this.tweetData)) {
      this.removeSchedule(finish);
    } else {
      this.tweet(ErrorTypes.Unknown, false, finish);
    }
  }

  /**
   * スケジュールを追加
   * @param finish
   */
  private addSchedule(finish: (isProcessed?: boolean) => void): void {
    const schedule = new TweetCronSchedule(this.tweetData);
    const command = this.getCronCommand(this.tweetData);

    if (!this.isValidCronFormat(this.tweetData)) {
      this.tweet(ErrorTypes.InvalidCronFormat, false, finish);
      return;
    } else if (!command) {
      this.tweet(ErrorTypes.InvalidCommand, false, finish);
      return;
    }

    const reservedNumber = Batch.addSchedule(
      this.tweetData.accountData.userId,
      schedule,
      command
    );
    if (reservedNumber === undefined) {
      this.tweet(ErrorTypes.SaveError, false, finish);
      return;
    }

    this.tweet(`${reservedNumber}番で予約しました。`, true, finish);
  }

  /**
   * 追加済みのスケジュールを削除
   * @param finish
   */
  private removeSchedule(finish: (isProcessed?: boolean) => void): void {
    const [reservedStr] = this.tweetData.options;
    const reservedNumber = parseInt(reservedStr);
    if (0 <= reservedNumber) {
      const result = Batch.removeSchedule(
        this.tweetData.accountData.userId,
        reservedNumber
      );
      if (result) {
        this.tweet(`${reservedNumber}番の予約を削除しました。`, true, finish);
        return;
      }
    }

    this.tweet(ErrorTypes.InvalidReservedNumber, false, finish);
  }

  private tweet(
    text: string,
    result: boolean,
    finish: (isProcessed?: boolean) => void
  ): void {
    const tweets = new OdnTweets(this.tweetData.accountData);
    tweets.text = `@${this.tweetData.user.screenName} ${text}`;
    tweets.targetTweetId = this.tweetData.idStr;
    tweets.postTweet(() => {
      finish(result);
    });
  }

  /**
   * プラグインを実行するかどうか判定
   *
   * @param {OdnTweetData} tweetData
   * @returns {boolean}
   */
  static isValid(tweetData: OdnTweetData): boolean {
    return (
      false === tweetData.isRetweet &&
      tweetData.isReplyToMe() &&
      this.isValidCommand(tweetData) &&
      this.isValidAction(tweetData)
    );
  }

  /**
   * 有効なコマンドか
   *
   * @param tweetData
   * @returns {boolean}
   */
  static isValidCommand(tweetData: OdnTweetData): boolean {
    this.setCommand();
    return tweetData.command.match(this.command) ? true : false;
  }

  /**
   * 有効なアクションか
   *
   * @param tweetData
   * @returns {boolean}
   */
  static isValidAction(tweetData: OdnTweetData): boolean {
    return (
      this.isValidAddAction(tweetData) || this.isValidRemoveAction(tweetData)
    );
  }

  /**
   * 有効な追加アクションか
   *
   * @param tweetData
   * @returns {boolean}
   */
  static isValidAddAction(tweetData: OdnTweetData): boolean {
    return tweetData.action.match(/^add$/gi) ? true : false;
  }

  /**
   * 有効な削除アクションか
   *
   * @param tweetData
   * @returns {boolean}
   */
  static isValidRemoveAction(tweetData: OdnTweetData): boolean {
    return tweetData.action.match(/^(remove|delete)$/gi) ? true : false;
  }

  /**
   * コマンドとなるワードを環境変数からセット
   */
  private static setCommand() {
    if (!this.command) {
      const text = (() => {
        const pluginName = TweetCronConstants.PLUGIN_FULL_NAME;
        const prefix = TweetCronConstants.CUSTOM_COMMAND_PREFIX;
        const defaultCommand = TweetCronConstants.DEFAULT_COMMAND;
        return OdnPlugins.getEnvData(pluginName, prefix) || defaultCommand;
      })();
      this.command = new RegExp('^(' + text + ')$', 'gi');
    }
  }

  /**
   * スケジュールのフォーマットが正しいか
   * @param tweetData
   */
  private isValidCronFormat(tweetData: OdnTweetData): boolean {
    return new TweetCronSchedule(tweetData).isValidSchedule();
  }

  /**
   * ツイートからコマンドとして扱う文字列を取得
   * @param tweetData
   */
  private getCronCommand(tweetData: OdnTweetData): string | undefined {
    if (tweetData?.text) {
      const [
        _sn,
        _co,
        _ac,
        _mi,
        _ho,
        _da,
        _mo,
        _we,
        ...command
      ] = tweetData.text.split(' ');
      return 0 < command?.length ? command.join(' ') : undefined;
    } else {
      return undefined;
    }
  }
}

namespace TweetCronConstants {
  export const DEFAULT_COMMAND = 'cron';
  export const PLUGIN_FULL_NAME = 'PluginsTweetTweetCron';
  export const CUSTOM_COMMAND_PREFIX = 'COMMAND';
  export const INVALID_DATE_ERROR = 'Invalid Date';
}

enum ErrorTypes {
  InvalidCronFormat = '日時のフォーマットに誤りがあります。「@NAME cron add 分 時 日 月 曜 投稿メッセージ」で投稿してください。',
  InvalidCommand = '投稿メッセージに誤りがあります。「@NAME cron add 分 時 日 月 曜 投稿メッセージ」で投稿してください。',
  InvalidReservedNumber = '予約された投稿が存在しません。',
  SaveError = 'スケジュールの保存に失敗しました。',
  Unknown = 'フォーマットに誤りがあります。「@NAME cron add 分 時 日 月 曜 投稿メッセージ」で投稿してください。'
}
