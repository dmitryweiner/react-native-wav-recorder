import React, { Component } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Picker,
  TextInput,
  Button,
  Alert,
  ToastAndroid,
} from 'react-native';
import { Buffer } from 'buffer';
import Permissions from 'react-native-permissions';
import Sound from 'react-native-sound';
import {AudioRecorder, AudioUtils} from 'react-native-audio';
import moment from 'moment';
const RNFS = require('react-native-fs'); // WTF???
const sanitize = require("sanitize-filename");

const STATE_INITIAL = 0;
const STATE_RECORDING = 1;
const STATE_LOADED = 2;
const STATE_PLAYING = 3;
const STATE_PAUSED = 4;

export default class App extends Component {
  sound = null;
  dir = `${RNFS.ExternalStorageDirectoryPath}`;
  defaultTargetFolder = 'WavRecorder';
  chunkReadingCycle = 0;
  state = {
    audioFile: '',
    audioPath: AudioUtils.DocumentDirectoryPath + '/test.aac',
    sampleRate: '16000',
    encoding: 'aac',
    targetFolder: this.defaultTargetFolder,
    appState: STATE_INITIAL,
    currentTime: null
  };

  async componentDidMount() {
    await this.checkPermissions();
    AudioRecorder.requestAuthorization().then(async (isAuthorised) => {

      if (!isAuthorised) {
        console.warn('Not authorized!');
        return;
      }

      await this.prepareRecordingPath(this.state.audioPath);

      AudioRecorder.onProgress = (data) => {
        this.setState({currentTime: Math.floor(data.currentTime)});
        console.log(data);
      };

    });
  }

  prepareRecordingPath = async (audioPath) => {
    AudioRecorder.prepareRecordingAtPath(audioPath, {
      SampleRate: Number.parseInt(this.state.sampleRate),
      Channels: 1,
      AudioQuality: "Low",
      AudioEncoding: this.state.encoding,
      AudioEncodingBitRate: 32000
    });
  };


  checkPermissions = async () => {
    try {
      console.log('permission check');
      const p = await Permissions.checkMultiple(['microphone', 'storage']);
      console.log('permission check result', p);
      if (p.microphone !== 'authorized' || p.storage !== 'authorized') {
        console.log('Requesting permissions');
        return await this.requestPermissions();
      }
    } catch (err) {
      Alert.alert('Error', 'Error requesting permissions');
      console.warn('Error checking permissions', err);
      return false;
    }
  };

  requestPermissions = async () => {
    await Permissions.request('microphone');
    await Permissions.request('storage');
  };

  checkDir = async () => {
    const dirPath = `${this.dir}/${this.state.targetFolder}`;
    try {
      const isExists = await RNFS.exists(dirPath);
      if (!isExists) {
        console.log('Creating directory', dirPath);
        await RNFS.mkdir(dirPath);
      }
      return true;
    } catch (err) {
      ToastAndroid.show(`Error creating directory ${dirPath}`);
      console.warn(`Error creating directory ${dirPath}`, err);
      return false;
    }
  };

  start = async () => {
    console.log('start record');
    this.setState({
      audioFile: '',
      appState: STATE_RECORDING,
      currentTime: 0
    });
    this.chunkReadingCycle = 0;
    try {
      await this.prepareRecordingPath(this.state.audioPath);
      const filePath = await AudioRecorder.startRecording();
      console.log('filePath', filePath);
    } catch (error) {
      console.error(error);
    }
  };

  saveFile = async (temporaryFileName) => {
    const dirIsOk = await this.checkDir();
    if (!dirIsOk) {
      return;
    }
    const newFilename = `${this.dir}/${this.state.targetFolder}/${moment().format('YYYY-MM-DD-HH-mm-ss')}.wav`;
    console.log('Trying to move file', temporaryFileName, newFilename);
    try {
      await RNFS.copyFile(temporaryFileName, newFilename);
      ToastAndroid.show(`New file saved here: ${newFilename}`, ToastAndroid.SHORT);
    } catch (err) {
      ToastAndroid.show(`Error saving file ${newFilename}: ${err.message}`);
      console.warn(`Error saving file ${newFilename}`, err);
    }
  };

  stop = async () => {
    if (this.state.appState !== STATE_RECORDING) return;
    console.log('stop record');
    try {
      const audioFile = await AudioRecorder.stopRecording();
      console.log('audioFile', audioFile);
      const isExists = await RNFS.exists(audioFile);
      if (isExists) {
        this.setState({
          audioFile,
        });
        await this.saveFile(audioFile);
      } else {
        console.warm('File not exists');
      }
    } catch (error) {
      console.error(error);
    }
    this.setState({
      appState: STATE_INITIAL
    });
  };

  play = async () => {
    // These timeouts are a hacky workaround for some issues with react-native-sound.
    // See https://github.com/zmxv/react-native-sound/issues/89.
    setTimeout(() => {
      this.sound = new Sound(this.state.audioPath, '', (error) => {
        if (error) {
          console.log('failed to load the sound', error);
        }
      });

      setTimeout(() => {
        this.setState({ appState: STATE_PLAYING });
        this.sound.play((success) => {
          if (success) {
            console.log('successfully finished playing');
          } else {
            console.log('playback failed due to audio decoding errors');
          }
          this.setState({ appState: STATE_PAUSED });
        });
      }, 100);
    }, 100);
  };

  pause = () => {
    this.sound.pause();
    this.setState({ appState: STATE_PAUSED });
  };

  render() {
    const { appState, audioFile } = this.state;
    return (
      <View style={styles.wrapper}>
        <View style={[styles.container, {height: 60}]}>
          <Text style={styles.title}>WAV Recorder</Text>
        </View>
        <View style={[styles.container, {height: 200}]}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>
              Sample rate (Hz)
            </Text>
            <Picker
              style={styles.fieldInput}
              textStyle={{fontSize: 15}}
              selectedValue={this.state.sampleRate}
              onValueChange={(itemValue) =>
                this.setState({sampleRate: itemValue})
              }>
              <Picker.Item label="8000" value="8000" />
              <Picker.Item label="11025" value="11025" />
              <Picker.Item label="16000" value="16000" />
              <Picker.Item label="22050" value="22050" />
            </Picker>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>
              Encoding
            </Text>
            <Picker
              style={styles.fieldInput}
              selectedValue={this.state.encoding}
              onValueChange={(itemValue) =>
                this.setState({encoding: itemValue})
              }>
              <Picker.Item label="aac" value="aac" />
              <Picker.Item label="amr_nb" value="amr_nb" />
              <Picker.Item label="amr_wb" value="amr_wb" />
              <Picker.Item label="he_aac" value="he_aac" />
            </Picker>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>
              Target folder
            </Text>
            <TextInput
              style={[styles.fieldInput, {fontSize: 15}]}
              onChangeText={(targetFolder) => {
                let newFolder = this.defaultTargetFolder;
                if (targetFolder.length > 0) {
                  newFolder = sanitize(targetFolder);
                }
                this.setState({targetFolder: newFolder});
              }}
              value={this.state.targetFolder}
            />
          </View>
          <View style={styles.field}>
            <Text style={{fontSize: 13}}>
              {`${this.dir}/${this.state.targetFolder}`}
            </Text>
          </View>
        </View>
        <View style={styles.fullSizeContainer}>
          <View style={styles.row}>
            <Button onPress={this.start} title="Record" disabled={[STATE_RECORDING, STATE_PLAYING].includes(appState)} />
            <Button onPress={this.stop} title="Stop" disabled={appState !== STATE_RECORDING} />
            {appState !== STATE_PLAYING ? (
              <Button onPress={this.play} title="Play" disabled={!audioFile} />
            ) : (
              <Button onPress={this.pause} title="Pause" disabled={!audioFile} />
            )}
          </View>
        </View>
        <View style={[styles.fullSizeContainer, {justifyContent: 'flex-start'}]}>
          <View style={styles.row}>
            <Text style={{fontSize: 70, color: '#24439d'}}>{moment.utc(this.state.currentTime * 1000).format('HH:mm:ss')}</Text>
          </View>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  title: {
    flex: 1,
    fontSize: 20,
    textAlign: 'center',
    marginTop: 20,
    color: '#268f40'
  },
  wrapper: {
    flex: 1,
    justifyContent: 'flex-start'
  },
  container: {
    flex: 0,
    justifyContent: 'center'
  },
  fullSizeContainer: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
  },
  field: {
    flex: 1,
    height: 50,
    paddingLeft: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start'
  },
  fieldLabel: {
    width: 150,
    fontSize: 15,
  },
  fieldInput: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-evenly'
  }
});
