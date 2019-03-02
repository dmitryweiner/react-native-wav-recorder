import React, { Component } from 'react';
import { StyleSheet, View, Button, Text, Alert, ToastAndroid, TextInput, Picker } from 'react-native';
import { Buffer } from 'buffer';
import Permissions from 'react-native-permissions';
import Sound from 'react-native-sound';
import AudioRecord from 'react-native-audio-record';
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
    sampleRate: '16000',
    targetFolder: this.defaultTargetFolder,
    appState: STATE_INITIAL,
    fileSize: 0
  };

  async componentDidMount() {
    await this.checkPermissions();
    await this.initAudioRecord();
    AudioRecord.on('data', data => {
      this.chunkReadingCycle++;
      if (this.chunkReadingCycle === 5) {
        const chunk = Buffer.from(data, 'base64');
        this.setState({fileSize: this.state.fileSize + chunk.byteLength})
        this.chunkReadingCycle = 0;
      }
    });
  }

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

  initAudioRecord = async () => {
    const options = {
      sampleRate: Number.parseInt(this.state.sampleRate),
      channels: 1,
      bitsPerSample: 16,
      wavFile: 'test.wav'
    };
    console.log('Init AudioRecord', options);
    await AudioRecord.init(options);

    /**
     * This needed for initial creating of temporary file
     */
    await AudioRecord.start();
    await AudioRecord.stop();
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
    await this.initAudioRecord();
    this.setState({
      audioFile: '',
      appState: STATE_RECORDING,
      fileSize: 0
    });
    this.chunkReadingCycle = 0;
    AudioRecord.start();
  };

  stop = async () => {
    if (this.state.appState !== STATE_RECORDING) return;
    console.log('stop record');
    let audioFile = await AudioRecord.stop();
    console.log('audioFile', audioFile);
    const isExists = await RNFS.exists(audioFile);
    if (isExists) {
      setTimeout(() => this.saveFile(audioFile), 1000);
    }
    this.setState({
      audioFile,
      appState: STATE_INITIAL
    });
  };

  load = () => {
    console.log('Trying to load file');
    return new Promise((resolve, reject) => {
      if (!this.state.audioFile) {
        return reject('file path is empty');
      }

      this.sound = new Sound(this.state.audioFile, '', error => {
        if (error) {
          console.log('failed to load the file', error);
          return reject(error);
        }
        this.setState({ appState: STATE_LOADED });
        return resolve();
      });
    });
  };

  play = async () => {
    if (this.appState !== STATE_LOADED) {
      try {
        await this.load();
      } catch (error) {
        console.log(error);
      }
    }

    this.setState({ appState: STATE_PLAYING });
    Sound.setCategory('Playback');

    this.sound.play(success => {
      if (success) {
        console.log('successfully finished playing');
      } else {
        console.log('playback failed due to audio decoding errors');
      }
      this.setState({ appState: STATE_PAUSED });
      // this.sound.release();
    });
  };

  pause = () => {
    this.sound.pause();
    this.setState({ appState: STATE_PAUSED });
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

  render() {
    const { appState, audioFile } = this.state;
    return (
      <View style={styles.wrapper}>
        <View style={styles.container}>
          <View style={styles.container}>
            <Text style={{flex: 1, fontSize: 20, textAlign: 'center', marginTop: 20}}>WAV Recorder</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>
              Sample rate (Hz)
            </Text>
            <Picker
              style={styles.fieldInput}
              selectedValue={this.state.sampleRate}
              onValueChange={(itemValue) =>
                this.setState({sampleRate: itemValue})
              }>
              <Picker.Item label="8000" value="8000" />
              <Picker.Item label="11025" value="11025" />
              <Picker.Item label="16000" value="16000" />
            </Picker>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>
              Target folder
            </Text>
            <TextInput
              style={styles.fieldInput}
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
            <Text style={{fontSize: 12}}>
              {`${this.dir}/${this.state.targetFolder}`}
            </Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>
              File size
            </Text>
            <Text style={styles.fieldInput}>
              {this.state.fileSize} bytes
            </Text>
          </View>
        </View>
        <View style={styles.container}>
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
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: 'flex-start'
  },
  container: {
    flex: 1,
    justifyContent: 'center'
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
    width: 150
  },
  fieldInput: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-evenly'
  }
});
